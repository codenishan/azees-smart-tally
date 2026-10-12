import "dotenv/config";
import crypto from "node:crypto";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { db } from "./db.js";

const app = express();
const port = Number(process.env.PORT || 3001);
const allowedEmail = "abdulazees3121@gmail.com";
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("Set JWT_SECRET to a random value of at least 32 characters before starting the server.");
}
if (!process.env.AUTH_PASSWORD || process.env.AUTH_PASSWORD.length < 10) {
  throw new Error("Set AUTH_PASSWORD to a password of at least 10 characters before starting the server.");
}
const timeoutMs = Number(process.env.SESSION_TIMEOUT_MINUTES || 30) * 60_000;
const passwordSalt = process.env.AUTH_PASSWORD_SALT || "smart-tally-password-v1";
const passwordHash = crypto.scryptSync(process.env.AUTH_PASSWORD, passwordSalt, 64);
const clientOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || clientOrigins.includes(origin)),
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

type AuthRequest = Request & { user?: { email: string; sessionId: string } };
function audit(req: Request, email: string, action: string, entity = "", entityId = "", details = "") {
  db.prepare("INSERT INTO audit_logs(email,action,entity,entity_id,details,ip) VALUES(?,?,?,?,?,?)")
    .run(email, action, entity, entityId, details.slice(0, 1000), req.ip);
}
function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const decoded = jwt.verify(token, jwtSecret!) as jwt.JwtPayload;
    const session = db.prepare("SELECT * FROM sessions WHERE id = ? AND email = ?").get(decoded.sid, allowedEmail) as
      | { id: string; email: string; last_activity: number; expires_at: number }
      | undefined;
    const now = Date.now();
    if (!session || session.expires_at < now || now - session.last_activity > timeoutMs) {
      if (session) db.prepare("DELETE FROM sessions WHERE id = ?").run(session.id);
      return res.status(401).json({ error: "Session expired. Please sign in again." });
    }
    db.prepare("UPDATE sessions SET last_activity = ?, expires_at = ? WHERE id = ?")
      .run(now, now + timeoutMs, session.id);
    req.user = { email: allowedEmail, sessionId: session.id };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input);
}
const loginSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(1) });
app.post("/api/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
  if (parsed.data.email !== allowedEmail) {
    audit(req, parsed.data.email, "login_blocked", "auth", "", "Unauthorized email");
    return res.status(403).json({ error: "This account is not authorized." });
  }
  const supplied = crypto.scryptSync(parsed.data.password, passwordSalt, 64);
  if (!crypto.timingSafeEqual(supplied, passwordHash)) {
    audit(req, allowedEmail, "login_failed", "auth", "", "Incorrect password");
    return res.status(401).json({ error: "Incorrect password." });
  }
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  db.prepare("INSERT INTO sessions(id,email,last_activity,expires_at) VALUES(?,?,?,?)")
    .run(sessionId, allowedEmail, now, now + timeoutMs);
  audit(req, allowedEmail, "login", "auth");
  const token = jwt.sign({ email: allowedEmail, sid: sessionId }, jwtSecret!, { expiresIn: "7d" });
  res.json({ token, user: { email: allowedEmail }, expiresIn: timeoutMs });
});
app.post("/api/auth/logout", auth, (req: AuthRequest, res) => {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(req.user!.sessionId);
  audit(req, req.user!.email, "logout", "auth");
  res.json({ ok: true });
});
app.get("/api/auth/me", auth, (req: AuthRequest, res) => res.json({ user: { email: req.user!.email } }));

app.use("/api", (req, res, next) => req.path.startsWith("/auth/") ? next() : auth(req as AuthRequest, res, next));
app.get("/api/dashboard", (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const totals = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN type='sale' AND date=? THEN amount END),0) sales,
    COALESCE(SUM(CASE WHEN type='purchase' AND date=? THEN amount END),0) purchases,
    COALESCE(SUM(CASE WHEN type='expense' AND date=? THEN amount END),0) expenses,
    COALESCE(SUM(CASE WHEN type='sale' AND substr(date,1,7)=? THEN amount END),0) month_sales,
    COALESCE(SUM(CASE WHEN type='purchase' AND substr(date,1,7)=? THEN amount END),0) month_purchases,
    COALESCE(SUM(CASE WHEN type='expense' AND substr(date,1,7)=? THEN amount END),0) month_expenses
    FROM transactions`).get(today, today, today, month, month, month) as Record<string, number>;
  const cash = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE payment_mode='cash'").get() as { value: number };
  const bank = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE payment_mode='bank'").get() as { value: number };
  const pending = db.prepare("SELECT COALESCE(SUM(amount-paid),0) value FROM transactions WHERE type IN ('sale','purchase') AND amount>paid").get() as { value: number };
  const recent = db.prepare("SELECT * FROM transactions ORDER BY date DESC,id DESC LIMIT 8").all();
  const trend = db.prepare(`SELECT substr(date,1,7) month, SUM(CASE WHEN type='sale' THEN amount ELSE 0 END) sales,
    SUM(CASE WHEN type='purchase' THEN amount ELSE 0 END) purchases FROM transactions
    WHERE date >= date('now','-5 months') AND type IN ('sale','purchase') GROUP BY substr(date,1,7) ORDER BY month`).all();
  const lowStock = db.prepare("SELECT COUNT(*) count FROM items WHERE quantity<=low_stock").get() as { count: number };
  res.json({ ...totals, cash: cash.value, bank: bank.value, pending: pending.value, recent, trend, lowStock: lowStock.count });
});

const ledgerSchema = z.object({
  name: z.string().trim().min(1).max(120), type: z.enum(["customer", "vendor", "bank", "cash", "other"]),
  phone: z.string().max(40).optional().default(""), email: z.string().max(150).optional().default(""),
  gstin: z.string().max(20).optional().default(""), opening_balance: z.coerce.number().finite().default(0),
  balance_type: z.enum(["receivable", "payable"]).default("receivable"), address: z.string().max(500).optional().default("")
});
app.get("/api/ledgers", (req, res) => {
  const search = String(req.query.search || "");
  res.json(db.prepare("SELECT * FROM ledgers WHERE name LIKE ? OR phone LIKE ? OR gstin LIKE ? ORDER BY name")
    .all(`%${search}%`, `%${search}%`, `%${search}%`));
});
app.post("/api/ledgers", (req: AuthRequest, res) => {
  const data = validate(ledgerSchema, req.body);
  const result = db.prepare("INSERT INTO ledgers(name,type,phone,email,gstin,opening_balance,balance_type,address) VALUES(@name,@type,@phone,@email,@gstin,@opening_balance,@balance_type,@address)").run(data);
  audit(req, req.user!.email, "create", "ledger", String(result.lastInsertRowid), data.name);
  res.status(201).json(db.prepare("SELECT * FROM ledgers WHERE id=?").get(result.lastInsertRowid));
});
app.put("/api/ledgers/:id", (req: AuthRequest, res) => {
  const data = validate(ledgerSchema, req.body);
  const result = db.prepare("UPDATE ledgers SET name=@name,type=@type,phone=@phone,email=@email,gstin=@gstin,opening_balance=@opening_balance,balance_type=@balance_type,address=@address WHERE id=@id").run({ ...data, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Ledger not found." });
  audit(req, req.user!.email, "update", "ledger", String(req.params.id), data.name);
  res.json(db.prepare("SELECT * FROM ledgers WHERE id=?").get(String(req.params.id)));
});
app.delete("/api/ledgers/:id", (req: AuthRequest, res) => {
  const result = db.prepare("DELETE FROM ledgers WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Ledger not found." });
  audit(req, req.user!.email, "delete", "ledger", String(req.params.id));
  res.json({ ok: true });
});

const transactionSchema = z.object({
  type: z.enum(["sale", "purchase", "expense", "collection", "payment"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), party_id: z.coerce.number().nullable().optional(),
  party_name: z.string().max(120).default(""), category: z.string().max(80).default(""),
  description: z.string().max(500).default(""), subtotal: z.coerce.number().nonnegative().default(0),
  tax: z.coerce.number().nonnegative().default(0), amount: z.coerce.number().positive(),
  payment_mode: z.enum(["cash", "bank", "upi", "credit"]).default("cash"),
  paid: z.coerce.number().nonnegative().default(0), status: z.string().max(30).default("paid")
});
function nextNumber(type: string) {
  const prefix = ({ sale: "INV", purchase: "PUR", expense: "EXP", collection: "COL", payment: "PAY" } as Record<string, string>)[type];
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const latest = db.prepare("SELECT MAX(CAST(substr(number,-3) AS INTEGER)) sequence FROM transactions WHERE number LIKE ?").get(`${prefix}-${date}-%`) as { sequence: number | null };
  return `${prefix}-${date}-${String((latest.sequence || 0) + 1).padStart(3, "0")}`;
}
app.get("/api/transactions", (req, res) => {
  const type = String(req.query.type || "");
  const from = String(req.query.from || "0000-01-01");
  const to = String(req.query.to || "9999-12-31");
  res.json(db.prepare("SELECT * FROM transactions WHERE date BETWEEN ? AND ? AND (?='' OR type=?) ORDER BY date DESC,id DESC LIMIT 500")
    .all(from, to, type, type));
});
app.post("/api/transactions", (req: AuthRequest, res) => {
  const data = validate(transactionSchema, req.body);
  if (data.party_id && !db.prepare("SELECT id FROM ledgers WHERE id=?").get(data.party_id)) return res.status(400).json({ error: "Selected ledger does not exist." });
  const number = nextNumber(data.type);
  const paid = data.paid ?? 0;
  const status = paid >= data.amount ? "paid" : paid > 0 ? "partial" : "unpaid";
  const result = db.prepare(`INSERT INTO transactions(type,number,date,party_id,party_name,category,description,subtotal,tax,amount,payment_mode,paid,status)
    VALUES(@type,@number,@date,@party_id,@party_name,@category,@description,@subtotal,@tax,@amount,@payment_mode,@paid,@status)`)
    .run({ ...data, number, status });
  audit(req, req.user!.email, "create", "transaction", String(result.lastInsertRowid), `${number} ${data.type}`);
  res.status(201).json(db.prepare("SELECT * FROM transactions WHERE id=?").get(result.lastInsertRowid));
});
app.patch("/api/transactions/:id/payment", (req: AuthRequest, res) => {
  const data = z.object({ paid: z.coerce.number().nonnegative() }).parse(req.body);
  const row = db.prepare("SELECT amount FROM transactions WHERE id=? AND type IN ('sale','purchase')").get(req.params.id) as { amount: number } | undefined;
  if (!row) return res.status(404).json({ error: "Invoice not found." });
  if (data.paid > row.amount) return res.status(400).json({ error: "Payment cannot exceed the invoice total." });
  db.prepare("UPDATE transactions SET paid=?,status=? WHERE id=?").run(data.paid, data.paid === row.amount ? "paid" : data.paid ? "partial" : "unpaid", req.params.id);
  audit(req, req.user!.email, "update_payment", "transaction", String(req.params.id), String(data.paid));
  res.json(db.prepare("SELECT * FROM transactions WHERE id=?").get(String(req.params.id)));
});

const itemSchema = z.object({
  name: z.string().trim().min(1).max(120), sku: z.string().max(80).default(""), category: z.string().max(80).default(""),
  barcode: z.string().max(80).default(""), quantity: z.coerce.number().default(0), low_stock: z.coerce.number().nonnegative().default(5),
  unit: z.string().max(20).default("pcs"), purchase_price: z.coerce.number().nonnegative().default(0),
  selling_price: z.coerce.number().nonnegative().default(0)
});
app.get("/api/items", (_req, res) => res.json(db.prepare("SELECT * FROM items ORDER BY name").all()));
app.post("/api/items", (req: AuthRequest, res) => {
  const data = validate(itemSchema, req.body);
  const result = db.prepare("INSERT INTO items(name,sku,category,barcode,quantity,low_stock,unit,purchase_price,selling_price) VALUES(@name,@sku,@category,@barcode,@quantity,@low_stock,@unit,@purchase_price,@selling_price)").run(data);
  audit(req, req.user!.email, "create", "item", String(result.lastInsertRowid), data.name);
  res.status(201).json(db.prepare("SELECT * FROM items WHERE id=?").get(result.lastInsertRowid));
});
app.put("/api/items/:id", (req: AuthRequest, res) => {
  const data = validate(itemSchema, req.body);
  const result = db.prepare("UPDATE items SET name=@name,sku=@sku,category=@category,barcode=@barcode,quantity=@quantity,low_stock=@low_stock,unit=@unit,purchase_price=@purchase_price,selling_price=@selling_price WHERE id=@id").run({ ...data, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Item not found." });
  audit(req, req.user!.email, "update", "item", String(req.params.id), data.name);
  res.json(db.prepare("SELECT * FROM items WHERE id=?").get(String(req.params.id)));
});
app.delete("/api/items/:id", (req: AuthRequest, res) => {
  const result = db.prepare("DELETE FROM items WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Item not found." });
  audit(req, req.user!.email, "delete", "item", String(req.params.id));
  res.json({ ok: true });
});
app.post("/api/items/:id/stock", (req: AuthRequest, res) => {
  const data = z.object({ movement: z.enum(["in", "out", "adjustment"]), quantity: z.coerce.number().positive(), note: z.string().max(200).default("") }).parse(req.body);
  const item = db.prepare("SELECT quantity FROM items WHERE id=?").get(req.params.id) as { quantity: number } | undefined;
  if (!item) return res.status(404).json({ error: "Item not found." });
  const quantity = data.movement === "adjustment" ? data.quantity : item.quantity + (data.movement === "in" ? data.quantity : -data.quantity);
  if (quantity < 0) return res.status(400).json({ error: "Stock cannot be reduced below zero." });
  const update = db.transaction(() => {
    db.prepare("UPDATE items SET quantity=? WHERE id=?").run(quantity, req.params.id);
    db.prepare("INSERT INTO stock_movements(item_id,movement,quantity,note) VALUES(?,?,?,?)").run(req.params.id, data.movement, data.quantity, data.note);
  });
  update();
  audit(req, req.user!.email, "stock_movement", "item", String(req.params.id), `${data.movement}: ${data.quantity}`);
  res.json(db.prepare("SELECT * FROM items WHERE id=?").get(String(req.params.id)));
});

app.get("/api/reports/trial-balance", (_req, res) => {
  res.json(db.prepare(`SELECT l.id,l.name,l.type,l.opening_balance,
    COALESCE(SUM(CASE WHEN t.type IN ('sale','collection') THEN t.amount WHEN t.type IN ('purchase','expense','payment') THEN -t.amount ELSE 0 END),0) activity,
    l.opening_balance + COALESCE(SUM(CASE WHEN t.type IN ('sale','collection') THEN t.amount WHEN t.type IN ('purchase','expense','payment') THEN -t.amount ELSE 0 END),0) balance
    FROM ledgers l LEFT JOIN transactions t ON t.party_id=l.id GROUP BY l.id ORDER BY l.name`).all());
});
app.get("/api/reports/profit-loss", (req, res) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 7) + "-01");
  const to = String(req.query.to || new Date().toISOString().slice(0, 10));
  res.json(db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN type='sale' THEN amount END),0) revenue,
    COALESCE(SUM(CASE WHEN type='purchase' THEN amount END),0) purchases,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) expenses
    FROM transactions WHERE date BETWEEN ? AND ?`).get(from, to));
});
app.get("/api/reports/balance-sheet", (_req, res) => {
  const cash = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE payment_mode='cash'").get() as { value: number };
  const bank = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE payment_mode='bank'").get() as { value: number };
  const stock = db.prepare("SELECT COALESCE(SUM(quantity*purchase_price),0) value FROM items").get() as { value: number };
  const receivables = db.prepare("SELECT COALESCE(SUM(amount-paid),0) value FROM transactions WHERE type='sale'").get() as { value: number };
  const payables = db.prepare("SELECT COALESCE(SUM(amount-paid),0) value FROM transactions WHERE type='purchase'").get() as { value: number };
  res.json({ cash: cash.value, bank: bank.value, inventory: stock.value, receivables: receivables.value, payables: payables.value });
});
app.get("/api/audit", (_req, res) => res.json(db.prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 200").all()));

app.get("/api/notes", (_req, res) => res.json(db.prepare("SELECT * FROM notes ORDER BY id DESC").all()));
app.post("/api/notes", (req: AuthRequest, res) => {
  const data = z.object({ title: z.string().min(1).max(120), body: z.string().max(2000).default(""), reminder_at: z.string().max(40).default("") }).parse(req.body);
  const result = db.prepare("INSERT INTO notes(title,body,reminder_at) VALUES(?,?,?)").run(data.title, data.body, data.reminder_at);
  audit(req, req.user!.email, "create", "note", String(result.lastInsertRowid), data.title);
  res.status(201).json(db.prepare("SELECT * FROM notes WHERE id=?").get(result.lastInsertRowid));
});
app.delete("/api/notes/:id", (req: AuthRequest, res) => {
  db.prepare("DELETE FROM notes WHERE id=?").run(Number(req.params.id));
  audit(req, req.user!.email, "delete", "note", String(req.params.id));
  res.json({ ok: true });
});

app.get("/api/backup", (_req, res) => {
  db.pragma("wal_checkpoint(FULL)");
  res.download(path.resolve(process.env.DATABASE_PATH || "./data/smart-tally.sqlite"), "smart-tally-backup.sqlite");
});
app.get("/api/backup/json", (_req, res) => {
  const tables = ["ledgers", "transactions", "items", "stock_movements", "notes"];
  res.json({ version: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(tables.map((name) => [name, db.prepare(`SELECT * FROM ${name}`).all()])) });
});
app.post("/api/backup/restore", (req: AuthRequest, res) => {
  const schema = z.object({ version: z.literal(1), data: z.record(z.array(z.record(z.unknown()))) });
  const backup = schema.parse(req.body);
  const supported = ["ledgers", "transactions", "items", "stock_movements", "notes"];
  const restore = db.transaction(() => {
    for (const table of [...supported].reverse()) db.prepare(`DELETE FROM ${table}`).run();
    for (const table of supported) {
      const rows = backup.data[table] || [];
      for (const row of rows) {
        const columns = Object.keys(row);
        if (!columns.length || columns.some((column) => !/^[a-z_]+$/.test(column))) throw new Error("Invalid backup columns.");
        db.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map((column) => `@${column}`).join(",")})`).run(row);
      }
    }
  });
  restore();
  audit(req, req.user!.email, "restore", "backup");
  res.json({ ok: true });
});

const clientDist = path.resolve("dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || "Invalid request." });
  console.error(err);
  res.status(500).json({ error: "An unexpected server error occurred." });
});
async function createDailyBackup() {
  const folder = path.resolve(process.env.BACKUP_PATH || "./backups");
  fs.mkdirSync(folder, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const destination = path.join(folder, `smart-tally-${day}.sqlite`);
  if (!fs.existsSync(destination)) {
    db.pragma("wal_checkpoint(FULL)");
    await db.backup(destination);
    console.log(`Daily database backup created: ${destination}`);
  }
  const retained = fs.readdirSync(folder)
    .filter((name) => /^smart-tally-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
    .sort()
    .slice(0, -30);
  for (const name of retained) fs.unlinkSync(path.join(folder, name));
}
const nextBackup = new Date();
nextBackup.setHours(2, 0, 0, 0);
if (nextBackup <= new Date()) nextBackup.setDate(nextBackup.getDate() + 1);
void createDailyBackup().catch((error: unknown) => console.error("Daily backup failed:", error));
setTimeout(() => {
  void createDailyBackup().catch((error: unknown) => console.error("Daily backup failed:", error));
  setInterval(() => {
    void createDailyBackup().catch((error: unknown) => console.error("Daily backup failed:", error));
  }, 24 * 60 * 60 * 1000);
}, nextBackup.getTime() - Date.now());
app.listen(port, "0.0.0.0", () => console.log(`Azees Smart Tally API listening on port ${port}`));
