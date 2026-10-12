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
const dateToday = () => new Date().toISOString().slice(0, 10);
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
function asyncRoute(handler: (req: AuthRequest, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req as AuthRequest, res).catch(next);
  };
}
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
    FROM transactions WHERE deleted_at IS NULL`).get(today, today, today, month, month, month) as Record<string, number>;
  const cash = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE deleted_at IS NULL AND payment_mode='cash'").get() as { value: number };
  const bank = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE deleted_at IS NULL AND payment_mode='bank'").get() as { value: number };
  const pending = db.prepare("SELECT COALESCE(SUM(amount-paid),0) value FROM transactions WHERE deleted_at IS NULL AND type IN ('sale','purchase') AND amount>paid").get() as { value: number };
  const recent = db.prepare("SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY date DESC,id DESC LIMIT 8").all();
  const trend = db.prepare(`SELECT substr(date,1,7) month, SUM(CASE WHEN type='sale' THEN amount ELSE 0 END) sales,
    SUM(CASE WHEN type='purchase' THEN amount ELSE 0 END) purchases FROM transactions
    WHERE deleted_at IS NULL AND date >= date('now','-5 months') AND type IN ('sale','purchase') GROUP BY substr(date,1,7) ORDER BY month`).all();
  const lowStock = db.prepare("SELECT COUNT(*) count FROM items WHERE deleted_at IS NULL AND quantity<=low_stock").get() as { count: number };
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
  res.json(db.prepare("SELECT * FROM ledgers WHERE deleted_at IS NULL AND (name LIKE ? OR phone LIKE ? OR gstin LIKE ?) ORDER BY name")
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
  const result = db.prepare("UPDATE ledgers SET name=@name,type=@type,phone=@phone,email=@email,gstin=@gstin,opening_balance=@opening_balance,balance_type=@balance_type,address=@address WHERE id=@id AND deleted_at IS NULL").run({ ...data, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Ledger not found." });
  audit(req, req.user!.email, "update", "ledger", String(req.params.id), data.name);
  res.json(db.prepare("SELECT * FROM ledgers WHERE id=?").get(String(req.params.id)));
});
app.delete("/api/ledgers/:id", (req: AuthRequest, res) => {
  const result = db.prepare("UPDATE ledgers SET deleted_at=datetime('now') WHERE id=? AND deleted_at IS NULL").run(Number(req.params.id));
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
  res.json(db.prepare("SELECT * FROM transactions WHERE deleted_at IS NULL AND date BETWEEN ? AND ? AND (?='' OR type=?) ORDER BY date DESC,id DESC LIMIT 500")
    .all(from, to, type, type));
});
app.post("/api/transactions", (req: AuthRequest, res) => {
  const data = validate(transactionSchema, req.body);
  if (data.party_id && !db.prepare("SELECT id FROM ledgers WHERE id=? AND deleted_at IS NULL").get(data.party_id)) return res.status(400).json({ error: "Selected ledger does not exist." });
  const number = nextNumber(data.type);
  const paid = data.paid ?? 0;
  const status = paid >= data.amount ? "paid" : paid > 0 ? "partial" : "unpaid";
  const result = db.prepare(`INSERT INTO transactions(type,number,date,party_id,party_name,category,description,subtotal,tax,amount,payment_mode,paid,status)
    VALUES(@type,@number,@date,@party_id,@party_name,@category,@description,@subtotal,@tax,@amount,@payment_mode,@paid,@status)`)
    .run({ ...data, party_id: data.party_id ?? null, number, paid, status });
  audit(req, req.user!.email, "create", "transaction", String(result.lastInsertRowid), `${number} ${data.type}`);
  res.status(201).json(db.prepare("SELECT * FROM transactions WHERE id=?").get(result.lastInsertRowid));
});
app.put("/api/transactions/:id", (req: AuthRequest, res) => {
  const data = validate(transactionSchema, req.body);
  const paid = data.paid ?? 0;
  if (paid > data.amount) return res.status(400).json({ error: "Payments cannot exceed the updated invoice total." });
  if (data.party_id && !db.prepare("SELECT id FROM ledgers WHERE id=? AND deleted_at IS NULL").get(data.party_id)) {
    return res.status(400).json({ error: "Selected ledger does not exist." });
  }
  const status = paid >= data.amount ? "paid" : paid > 0 ? "partial" : "unpaid";
  const result = db.prepare(`UPDATE transactions SET date=@date,party_id=@party_id,party_name=@party_name,category=@category,
    description=@description,subtotal=@subtotal,tax=@tax,amount=@amount,payment_mode=@payment_mode,paid=@paid,status=@status
    WHERE id=@id AND deleted_at IS NULL`).run({ ...data, party_id: data.party_id ?? null, paid, status, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Transaction not found." });
  audit(req, req.user!.email, "update", "transaction", String(req.params.id));
  res.json(db.prepare("SELECT * FROM transactions WHERE id=?").get(Number(req.params.id)));
});
app.delete("/api/transactions/:id", (req: AuthRequest, res) => {
  const result = db.prepare("UPDATE transactions SET deleted_at=datetime('now') WHERE id=? AND deleted_at IS NULL").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Transaction not found." });
  audit(req, req.user!.email, "delete", "transaction", String(req.params.id), "Moved to Recycle Bin");
  res.json({ ok: true, restoreDays: 30 });
});
app.post("/api/transactions/:id/duplicate", (req: AuthRequest, res) => {
  const row = db.prepare("SELECT * FROM transactions WHERE id=? AND deleted_at IS NULL").get(Number(req.params.id)) as
    | { type: string; date: string; party_id: number | null; party_name: string; category: string; description: string; subtotal: number; tax: number; amount: number; payment_mode: string }
    | undefined;
  if (!row) return res.status(404).json({ error: "Transaction not found." });
  const number = nextNumber(row.type);
  const result = db.prepare(`INSERT INTO transactions(type,number,date,party_id,party_name,category,description,subtotal,tax,amount,payment_mode,paid,status)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,0,'unpaid')`)
    .run(row.type, number, dateToday(), row.party_id, row.party_name, row.category, row.description, row.subtotal, row.tax, row.amount, row.payment_mode);
  audit(req, req.user!.email, "duplicate", "transaction", String(result.lastInsertRowid), number);
  res.status(201).json(db.prepare("SELECT * FROM transactions WHERE id=?").get(result.lastInsertRowid));
});
app.post("/api/transactions/:id/reset", (req: AuthRequest, res) => {
  const result = db.prepare("UPDATE transactions SET paid=0,status='unpaid' WHERE id=? AND type IN ('sale','purchase') AND deleted_at IS NULL").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Active invoice not found." });
  audit(req, req.user!.email, "reset_payment", "transaction", String(req.params.id));
  res.json(db.prepare("SELECT * FROM transactions WHERE id=?").get(Number(req.params.id)));
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
app.get("/api/items", (_req, res) => res.json(db.prepare("SELECT * FROM items WHERE deleted_at IS NULL ORDER BY name").all()));
app.post("/api/items", (req: AuthRequest, res) => {
  const data = validate(itemSchema, req.body);
  const result = db.prepare("INSERT INTO items(name,sku,category,barcode,quantity,low_stock,unit,purchase_price,selling_price) VALUES(@name,@sku,@category,@barcode,@quantity,@low_stock,@unit,@purchase_price,@selling_price)").run(data);
  audit(req, req.user!.email, "create", "item", String(result.lastInsertRowid), data.name);
  res.status(201).json(db.prepare("SELECT * FROM items WHERE id=?").get(result.lastInsertRowid));
});
app.put("/api/items/:id", (req: AuthRequest, res) => {
  const data = validate(itemSchema, req.body);
  const result = db.prepare("UPDATE items SET name=@name,sku=@sku,category=@category,barcode=@barcode,quantity=@quantity,low_stock=@low_stock,unit=@unit,purchase_price=@purchase_price,selling_price=@selling_price WHERE id=@id AND deleted_at IS NULL").run({ ...data, id: Number(req.params.id) });
  if (!result.changes) return res.status(404).json({ error: "Item not found." });
  audit(req, req.user!.email, "update", "item", String(req.params.id), data.name);
  res.json(db.prepare("SELECT * FROM items WHERE id=?").get(String(req.params.id)));
});
app.delete("/api/items/:id", (req: AuthRequest, res) => {
  const result = db.prepare("UPDATE items SET deleted_at=datetime('now') WHERE id=? AND deleted_at IS NULL").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Item not found." });
  audit(req, req.user!.email, "delete", "item", String(req.params.id));
  res.json({ ok: true });
});
app.post("/api/items/:id/stock", (req: AuthRequest, res) => {
  const data = z.object({ movement: z.enum(["in", "out", "adjustment"]), quantity: z.coerce.number().positive(), note: z.string().max(200).default("") }).parse(req.body);
  const item = db.prepare("SELECT quantity FROM items WHERE id=? AND deleted_at IS NULL").get(req.params.id) as { quantity: number } | undefined;
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
app.post("/api/items/:id/reset-stock", (req: AuthRequest, res) => {
  const item = db.prepare("SELECT quantity FROM items WHERE id=? AND deleted_at IS NULL").get(Number(req.params.id)) as { quantity: number } | undefined;
  if (!item) return res.status(404).json({ error: "Active item not found." });
  const reset = db.transaction(() => {
    db.prepare("UPDATE items SET quantity=0 WHERE id=?").run(Number(req.params.id));
    if (item.quantity > 0) db.prepare("INSERT INTO stock_movements(item_id,movement,quantity,note) VALUES(?,'adjustment',?,'Stock reset to zero')").run(Number(req.params.id), item.quantity);
  });
  reset();
  audit(req, req.user!.email, "reset_stock", "item", String(req.params.id), String(item.quantity));
  res.json(db.prepare("SELECT * FROM items WHERE id=?").get(Number(req.params.id)));
});

app.get("/api/reports/trial-balance", (_req, res) => {
  res.json(db.prepare(`SELECT l.id,l.name,l.type,l.opening_balance,
    COALESCE(SUM(CASE WHEN t.type IN ('sale','collection') THEN t.amount WHEN t.type IN ('purchase','expense','payment') THEN -t.amount ELSE 0 END),0) activity,
    l.opening_balance + COALESCE(SUM(CASE WHEN t.type IN ('sale','collection') THEN t.amount WHEN t.type IN ('purchase','expense','payment') THEN -t.amount ELSE 0 END),0) balance
    FROM ledgers l LEFT JOIN transactions t ON t.party_id=l.id AND t.deleted_at IS NULL
    WHERE l.deleted_at IS NULL GROUP BY l.id ORDER BY l.name`).all());
});
app.get("/api/reports/profit-loss", (req, res) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 7) + "-01");
  const to = String(req.query.to || new Date().toISOString().slice(0, 10));
  res.json(db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN type='sale' THEN amount END),0) revenue,
    COALESCE(SUM(CASE WHEN type='purchase' THEN amount END),0) purchases,
    COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) expenses
    FROM transactions WHERE deleted_at IS NULL AND date BETWEEN ? AND ?`).get(from, to));
});
app.get("/api/reports/balance-sheet", (_req, res) => {
  const cash = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE deleted_at IS NULL AND payment_mode='cash'").get() as { value: number };
  const bank = db.prepare("SELECT COALESCE(SUM(CASE WHEN type IN ('sale','collection') THEN paid WHEN type IN ('purchase','expense','payment') THEN -paid END),0) value FROM transactions WHERE deleted_at IS NULL AND payment_mode='bank'").get() as { value: number };
  const stock = db.prepare("SELECT COALESCE(SUM(quantity*purchase_price),0) value FROM items WHERE deleted_at IS NULL").get() as { value: number };
  const receivables = db.prepare("SELECT COALESCE(SUM(amount-paid),0) value FROM transactions WHERE deleted_at IS NULL AND type='sale'").get() as { value: number };
  const payables = db.prepare("SELECT COALESCE(SUM(amount-paid),0) value FROM transactions WHERE deleted_at IS NULL AND type='purchase'").get() as { value: number };
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

app.get("/api/recycle-bin", (_req, res) => {
  const rows = db.prepare(`SELECT kind,id,label,detail,record_date,deleted_at FROM (
    SELECT 'invoice' kind,id,number label,party_name detail,date record_date,deleted_at FROM transactions
    UNION ALL
    SELECT CASE type WHEN 'customer' THEN 'customer' WHEN 'vendor' THEN 'supplier' ELSE 'ledger' END,
      id,name,phone,'',deleted_at FROM ledgers
    UNION ALL
    SELECT 'item',id,name,sku,'',deleted_at FROM items
  ) WHERE deleted_at IS NOT NULL AND deleted_at >= datetime('now','-30 days') ORDER BY deleted_at DESC`).all();
  res.json(rows);
});
app.post("/api/recycle-bin/:kind/:id/restore", (req: AuthRequest, res) => {
  const kind = z.enum(["invoice", "customer", "supplier", "ledger", "item"]).parse(req.params.kind);
  const table = kind === "invoice" ? "transactions" : kind === "item" ? "items" : "ledgers";
  const typeGuard = kind === "customer" ? " AND type='customer'" : kind === "supplier" ? " AND type='vendor'" : "";
  const result = db.prepare(`UPDATE ${table} SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL AND deleted_at>=datetime('now','-30 days')${typeGuard}`).run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Deleted record not found or its 30-day recovery period has expired." });
  audit(req, req.user!.email, "restore", kind, String(req.params.id));
  res.json({ ok: true });
});
app.delete("/api/recycle-bin/:kind/:id", (req: AuthRequest, res) => {
  const kind = z.enum(["invoice", "customer", "supplier", "ledger", "item"]).parse(req.params.kind);
  const table = kind === "invoice" ? "transactions" : kind === "item" ? "items" : "ledgers";
  const typeGuard = kind === "customer" ? " AND type='customer'" : kind === "supplier" ? " AND type='vendor'" : "";
  const result = db.prepare(`DELETE FROM ${table} WHERE id=? AND deleted_at IS NOT NULL${typeGuard}`).run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Deleted record not found." });
  audit(req, req.user!.email, "permanent_delete", kind, String(req.params.id));
  res.json({ ok: true });
});
app.post("/api/reset", asyncRoute(async (req, res) => {
  const data = z.object({
    scope: z.enum(["today", "month", "year", "module", "full"]),
    module: z.enum(["transactions", "sales", "purchases", "expenses", "customers", "suppliers", "ledgers", "items", "notes"]).optional()
  }).parse(req.body);
  if (data.scope === "module" && !data.module) return res.status(400).json({ error: "Choose a module to reset." });
  const folder = path.resolve(process.env.BACKUP_PATH || "./backups");
  fs.mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(folder, `pre-reset-${stamp}.sqlite`);
  db.pragma("wal_checkpoint(FULL)");
  await db.backup(backupPath);
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) throw new Error("Safety backup verification failed; reset cancelled.");

  let start = "";
  let end = "";
  if (data.scope === "today") { start = dateToday(); end = start; }
  if (data.scope === "month") { start = `${dateToday().slice(0, 7)}-01`; end = dateToday(); }
  if (data.scope === "year") { start = `${dateToday().slice(0, 4)}-01-01`; end = dateToday(); }
  const module = data.scope === "module" ? data.module! : "";
  const txTypes = module === "sales" ? ["sale"] : module === "purchases" ? ["purchase"] : module === "expenses" ? ["expense"] : [];
  const resetRows = db.transaction(() => {
    if (["today", "month", "year"].includes(data.scope)) {
      db.prepare("UPDATE transactions SET deleted_at=datetime('now') WHERE deleted_at IS NULL AND date BETWEEN ? AND ?").run(start, end);
    } else if (data.scope === "module" && txTypes.length) {
      db.prepare(`UPDATE transactions SET deleted_at=datetime('now') WHERE deleted_at IS NULL AND type=?`).run(txTypes[0]);
    } else if (data.scope === "module" && ["transactions"].includes(module)) {
      db.prepare("UPDATE transactions SET deleted_at=datetime('now') WHERE deleted_at IS NULL").run();
    } else if (data.scope === "module" && ["customers", "suppliers", "ledgers"].includes(module)) {
      const type = module === "customers" ? " AND type='customer'" : module === "suppliers" ? " AND type='vendor'" : "";
      db.prepare(`UPDATE ledgers SET deleted_at=datetime('now') WHERE deleted_at IS NULL${type}`).run();
    } else if (data.scope === "module" && module === "items") {
      db.prepare("UPDATE items SET deleted_at=datetime('now') WHERE deleted_at IS NULL").run();
    } else if (data.scope === "module" && module === "notes") {
      db.prepare("DELETE FROM notes").run();
    } else if (data.scope === "full") {
      db.prepare("UPDATE transactions SET deleted_at=datetime('now') WHERE deleted_at IS NULL").run();
      db.prepare("UPDATE ledgers SET deleted_at=datetime('now') WHERE deleted_at IS NULL").run();
      db.prepare("UPDATE items SET deleted_at=datetime('now') WHERE deleted_at IS NULL").run();
      db.prepare("DELETE FROM notes").run();
    }
  });
  resetRows();
  audit(req, req.user!.email, "reset", data.scope === "module" ? module : data.scope, undefined, `Safety backup: ${path.basename(backupPath)}`);
  res.json({ ok: true, backup: path.basename(backupPath) });
}));

app.get("/api/backup", (_req, res) => {
  db.pragma("wal_checkpoint(FULL)");
  res.download(path.resolve(process.env.DATABASE_PATH || "./data/smart-tally.sqlite"), "smart-tally-backup.sqlite");
});
app.get("/api/backup/json", (_req, res) => {
  const tables = ["ledgers", "transactions", "items", "stock_movements", "notes"];
  res.json({ version: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(tables.map((name) => [name, db.prepare(`SELECT * FROM ${name}`).all()])) });
});
app.post("/api/backup/restore", asyncRoute(async (req, res) => {
  const schema = z.object({ version: z.literal(1), data: z.record(z.array(z.record(z.unknown()))) });
  const backup = schema.parse(req.body);
  const folder = path.resolve(process.env.BACKUP_PATH || "./backups");
  fs.mkdirSync(folder, { recursive: true });
  const safetyCopy = path.join(folder, `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
  db.pragma("wal_checkpoint(FULL)");
  await db.backup(safetyCopy);
  if (!fs.existsSync(safetyCopy) || fs.statSync(safetyCopy).size === 0) throw new Error("Safety backup verification failed; restore cancelled.");
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
}));

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
  const purge = db.transaction(() => {
    const removedTransactions = db.prepare("DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").run().changes;
    const removedItems = db.prepare("DELETE FROM items WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").run().changes;
    const removedLedgers = db.prepare("DELETE FROM ledgers WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now','-30 days')").run().changes;
    const total = removedTransactions + removedItems + removedLedgers;
    if (total) db.prepare("INSERT INTO audit_logs(email,action,entity,details) VALUES(?,?,?,?)")
      .run(allowedEmail, "permanent_delete_expired", "recycle-bin", `${removedTransactions} invoices, ${removedItems} items, ${removedLedgers} ledgers purged after 30 days`);
    return total;
  });
  const purged = purge();
  if (purged) console.log(`Purged ${purged} expired recycle-bin records.`);
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
