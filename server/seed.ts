import "dotenv/config";
import { db } from "./db.js";

const existing = db.prepare("SELECT COUNT(*) count FROM ledgers").get() as { count: number };
if (existing.count > 0) {
  console.log("Database already contains ledgers; seed skipped.");
  process.exit(0);
}
const createLedger = db.prepare("INSERT INTO ledgers(name,type,phone,email,gstin,opening_balance,balance_type) VALUES(?,?,?,?,?,?,?)");
const customer = createLedger.run("Aarav Stores", "customer", "+91 98765 43210", "accounts@aaravstores.in", "27AABCU9603R1ZM", 0, "receivable").lastInsertRowid;
const vendor = createLedger.run("Greenline Suppliers", "vendor", "+91 98765 12345", "", "27AABCU9603R1ZV", 0, "payable").lastInsertRowid;
createLedger.run("HDFC Current Account", "bank", "", "", "", 0, "receivable");
const tx = db.prepare("INSERT INTO transactions(type,number,date,party_id,party_name,category,description,subtotal,tax,amount,payment_mode,paid,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)");
const today = new Date().toISOString().slice(0, 10);
const offset = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
tx.run("sale", "INV-20261001-001", today, customer, "Aarav Stores", "", "Monthly supply order", 25000, 4500, 29500, "bank", 23000, "partial");
tx.run("purchase", "PUR-20261001-001", today, vendor, "Greenline Suppliers", "", "Stock replenishment", 14500, 2610, 17110, "cash", 10000, "partial");
tx.run("expense", "EXP-20261001-001", today, null, "Fuel", "Fuel", "Local deliveries", 1800, 0, 1800, "cash", 1800, "paid");
tx.run("sale", "INV-20260930-001", offset(1), customer, "Aarav Stores", "", "Retail goods", 12500, 2250, 14750, "cash", 14750, "paid");
tx.run("expense", "EXP-20260928-001", offset(3), null, "Office", "Office expense", "Office supplies", 2400, 0, 2400, "bank", 2400, "paid");
const item = db.prepare("INSERT INTO items(name,sku,category,barcode,quantity,low_stock,unit,purchase_price,selling_price) VALUES(?,?,?,?,?,?,?,?,?)");
item.run("Premium Tea 500g", "TEA-500", "Groceries", "8901234567890", 36, 10, "pack", 180, 245);
item.run("Organic Coffee 250g", "COF-250", "Groceries", "8901234567891", 8, 12, "pack", 260, 350);
item.run("Paper Carry Bags", "BAG-01", "Packaging", "8901234567892", 120, 25, "pcs", 3, 8);
console.log("Sample ledgers, transactions, and inventory created.");
