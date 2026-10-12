import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownLeft, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Boxes, CalendarDays, Check, ChevronDown, CircleHelp, Command, Download,
  FileBarChart, FileText, Filter, LayoutDashboard, LogOut, Menu, Moon, MoreHorizontal,
  Package, Plus, Search, Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sun, TrendingUp,
  Wallet, X, Users, ReceiptIndianRupee, Sparkles, Calculator, NotebookPen, ScanBarcode
} from "lucide-react";

type Tab = "Overview" | "Sales" | "Purchases" | "Expenses" | "Inventory" | "Ledgers" | "Accounting" | "Reports" | "Tools" | "Settings";
type Row = Record<string, string | number | null>;
type Dashboard = { sales: number; purchases: number; expenses: number; month_sales: number; month_purchases: number; month_expenses: number; cash: number; bank: number; pending: number; recent: Row[]; trend: Array<{ month: string; sales: number; purchases: number }>; lowStock: number };
const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");
const apiUrl = (path: string) => `${API_BASE}/api${path}`;
const nav: Array<{ name: Tab; icon: typeof LayoutDashboard; group?: string }> = [
  { name: "Overview", icon: LayoutDashboard, group: "Workspace" },
  { name: "Sales", icon: ShoppingBag }, { name: "Purchases", icon: ShoppingCart }, { name: "Expenses", icon: ReceiptIndianRupee },
  { name: "Inventory", icon: Boxes, group: "Manage" }, { name: "Ledgers", icon: Users },
  { name: "Accounting", icon: BookOpen, group: "Insights" }, { name: "Reports", icon: FileBarChart },
  { name: "Tools", icon: Sparkles }, { name: "Settings", icon: Settings }
];
const money = (value: number | string | null = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const dateToday = () => new Date().toISOString().slice(0, 10);
const cashNumber = (value: unknown) => Number(value) || 0;

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("st_token") || "");
  const [tab, setTab] = useState<Tab>("Overview");
  const [dark, setDark] = useState(() => localStorage.getItem("st_theme") === "dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"sale" | "purchase" | "expense" | "ledger" | "item" | "note" | null>(null);
  const [editingLedger, setEditingLedger] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; localStorage.setItem("st_theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener("st-refresh", update);
    return () => window.removeEventListener("st-refresh", update);
  }, []);
  useEffect(() => {
    const reportError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("st-error", reportError);
    return () => window.removeEventListener("st-error", reportError);
  }, []);
  useEffect(() => {
    if (!token) return;
    const idleTimeout = Number(localStorage.getItem("st_timeout_ms")) || 30 * 60 * 1000;
    let logoutTimer = 0;
    let lastPing = 0;
    const expired = () => {
      localStorage.removeItem("st_token");
      setToken("");
      setError("Your session expired after inactivity. Please sign in again.");
    };
    const noteActivity = () => {
      window.clearTimeout(logoutTimer);
      logoutTimer = window.setTimeout(expired, idleTimeout);
      if (Date.now() - lastPing < 90_000) return;
      lastPing = Date.now();
      void fetch(apiUrl("/auth/me"), { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => { if (!response.ok) expired(); })
        .catch((err: unknown) => window.dispatchEvent(new CustomEvent("st-error", { detail: err instanceof Error ? err.message : "Session check failed." })));
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "mousemove"];
    noteActivity();
    events.forEach((event) => window.addEventListener(event, noteActivity, { passive: true }));
    return () => {
      window.clearTimeout(logoutTimer);
      events.forEach((event) => window.removeEventListener(event, noteActivity));
    };
  }, [token]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const response = await fetch(apiUrl(path), {
      ...init, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }
    });
    if (response.status === 401 && token) { localStorage.removeItem("st_token"); setToken(""); throw new Error("Session expired. Sign in again."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }, [token]);

  const signOut = async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch { /* session may already have expired */ }
    localStorage.removeItem("st_token"); setToken("");
  };
  if (!token) return <Login initialError={error} onLogin={(value, timeout) => { localStorage.setItem("st_token", value); localStorage.setItem("st_timeout_ms", String(timeout)); setError(""); setToken(value); }} />;

  const actionFor = (action: string) => {
    if (action === "invoice") setModal("sale");
    else if (action === "purchase") setModal("purchase");
    else if (action === "expense") setModal("expense");
    else if (action === "ledger") setModal("ledger");
    else if (action === "item") setModal("item");
    else if (action === "note") setModal("note");
  };

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
      <div className="brand"><span className="brand-icon"><Command size={21} strokeWidth={2.4} /></span><div><b>Azees Smart Tally</b><small>PERSONAL EDITION</small></div><button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="company-switch"><span className="company-avatar">A</span><div><b>Azees' Business</b><small>Personal workspace</small></div><ChevronDown size={15}/></div>
      <nav className="side-nav">
        {nav.map((item) => <div key={item.name}>
          {item.group && <div className="nav-group">{item.group}</div>}
          <button className={`nav-item ${tab === item.name ? "active" : ""}`} onClick={() => { setTab(item.name); setMenuOpen(false); setSearch(""); }}><item.icon size={18}/><span>{item.name}</span>{item.name === "Inventory" && <span className="nav-count">3</span>}</button>
        </div>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="help-card"><div className="help-icon"><CircleHelp size={16}/></div><b>Need a hand?</b><span>Explore your getting started guide.</span><button onClick={() => setToast("Your workspace is ready. Add a ledger or create your first invoice.")}>View quick guide <ArrowRight size={14}/></button></div>
        <div className="profile"><div className="profile-avatar">A</div><div className="profile-info"><b>Azees</b><span>Owner · Personal</span></div><button className="icon-button" onClick={signOut} title="Sign out"><LogOut size={17}/></button></div>
      </div>
    </aside>
    {menuOpen && <button aria-label="Close menu overlay" className="mobile-overlay" onClick={() => setMenuOpen(false)} />}
    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left"><button className="icon-button menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><b>{tab}</b></div></div>
        <div className="topbar-actions"><div className="today-pill"><CalendarDays size={15}/><span>{new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span></div><button className="icon-button theme-button" onClick={() => setDark(!dark)} title={`Switch to ${dark ? "light" : "dark"} mode`}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><button className="notification-button" onClick={() => setTab("Reports")} aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar">A</div></div>
      </header>
      <div className="content-area">
        {tab === "Overview" && <DashboardPage api={api} refresh={refresh} onAction={actionFor} onNavigate={setTab}/>}
        {tab === "Sales" && <TransactionsPage type="sale" title="Sales & invoices" api={api} refresh={refresh} search={search} setSearch={setSearch} onAction={() => setModal("sale")} setToast={setToast}/>}
        {tab === "Purchases" && <TransactionsPage type="purchase" title="Purchases" api={api} refresh={refresh} search={search} setSearch={setSearch} onAction={() => setModal("purchase")} setToast={setToast}/>}
        {tab === "Expenses" && <TransactionsPage type="expense" title="Expenses" api={api} refresh={refresh} search={search} setSearch={setSearch} onAction={() => setModal("expense")} setToast={setToast}/>}
        {tab === "Ledgers" && <LedgersPage api={api} refresh={refresh} search={search} setSearch={setSearch} onAction={() => { setEditingLedger(null); setModal("ledger"); }} onEdit={(row) => { setEditingLedger(row); setModal("ledger"); }} setToast={setToast}/>}
        {tab === "Inventory" && <InventoryPage api={api} refresh={refresh} search={search} setSearch={setSearch} onAction={() => setModal("item")} setToast={setToast}/>}
        {tab === "Accounting" && <AccountingPage api={api} refresh={refresh} setToast={setToast}/>}
        {tab === "Reports" && <ReportsPage api={api} refresh={refresh}/>}
        {tab === "Tools" && <ToolsPage api={api} refresh={refresh} onAction={actionFor} setToast={setToast}/>}
        {tab === "Settings" && <SettingsPage api={api} setToast={setToast} signOut={signOut}/>}
      </div>
    </main>
    <nav className="mobile-nav">
      {[nav[0], nav[1], nav[2], nav[4]].map((item) => <button key={item.name} className={tab === item.name ? "selected" : ""} onClick={() => setTab(item.name)}><item.icon size={20}/><span>{item.name}</span></button>)}
      <button onClick={() => setMenuOpen(true)}><MoreHorizontal size={20}/><span>More</span></button>
    </nav>
    {modal && <EntryModal type={modal} api={api} initial={editingLedger || undefined} onClose={() => { setModal(null); setEditingLedger(null); }} onSaved={() => { setModal(null); setEditingLedger(null); setRefresh((n) => n + 1); setToast("Saved successfully"); }} onError={setError}/>}
    {error && <div className="toast toast-error">{error}<button onClick={() => setError("")}><X size={14}/></button></div>}
    {toast && <div className="toast"><Check size={16}/>{toast}</div>}
  </div>;
}
export default App;

function Login({ onLogin, initialError = "" }: { onLogin: (token: string, timeout: number) => void; initialError?: string }) {
  const [email, setEmail] = useState("abdulazees3121@gmail.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError("");
    try {
      const response = await fetch(apiUrl("/auth/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to sign in");
      onLogin(data.token, data.expiresIn);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to sign in"); }
    finally { setLoading(false); }
  };
  return <div className="login-screen"><div className="login-art"><div className="art-grid"/><div className="art-content"><div className="brand login-brand"><span className="brand-icon"><Command size={21}/></span><div><b>Azees Smart Tally</b><small>PERSONAL EDITION</small></div></div><div className="art-copy"><div className="eyebrow"><span/> YOUR BUSINESS, IN BALANCE</div><h1>Clarity for every<br/><em>rupee earned.</em></h1><p>Your business finances, inventory and insights — in one private workspace made for you, Azees.</p><div className="art-stats"><div><b>01</b><span>Your books, always in sync</span></div><div><b>02</b><span>Made for your business</span></div></div></div><div className="art-footer"><ShieldCheck size={15}/> Private workspace · Signed sessions</div></div></div>
    <div className="login-panel"><form className="login-form" onSubmit={submit}><div className="login-welcome"><span className="login-mark"><Command size={19}/></span><div className="eyebrow">WELCOME BACK</div><h2>Sign in to your<br/>workspace</h2><p>Your business is right where you left it.</p></div><label>Email address<div className="input-wrap"><Users size={17}/><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"/></div></label><label>Password<div className="input-wrap"><ShieldCheck size={17}/><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password"/></div></label>{error && <div className="form-error">{error}</div>}<button className="primary-button login-submit" disabled={loading}>{loading ? "Signing in..." : <>Sign in securely <ArrowRight size={17}/></>}</button><div className="login-foot"><ShieldCheck size={14}/> Only the authorized workspace owner can sign in.</div></form></div></div>;
}

function PageHeading({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function PrimaryButton({ children, onClick, secondary = false }: { children: ReactNode; onClick: () => void; secondary?: boolean }) {
  return <button className={secondary ? "secondary-button" : "primary-button"} onClick={onClick}><Plus size={17}/>{children}</button>;
}
function SectionHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section-head"><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><FileText size={20}/></div><b>{title}</b><span>{text}</span>{action}</div>;
}
function DashboardPage({ api, refresh, onAction, onNavigate }: { api: (path: string, init?: RequestInit) => Promise<any>; refresh: number; onAction: (action: string) => void; onNavigate: (tab: Tab) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { api("/dashboard").then(setData).catch((err) => { setData(null); window.dispatchEvent(new CustomEvent("st-error", { detail: err instanceof Error ? err.message : "Unable to load the dashboard." })); }); }, [api, refresh]);
  const list = data?.recent || [];
  const trend = data?.trend || [];
  const max = Math.max(...trend.map((row) => row.sales), 1);
  return <><PageHeading eyebrow="AZEES' PERSONAL BUSINESS OVERVIEW" title="Welcome Azees" subtitle="Here’s what’s happening with your business today." action={<PrimaryButton onClick={() => onAction("invoice")}>New invoice</PrimaryButton>}/>
    <div className="quick-actions"><button onClick={() => onAction("invoice")}><span className="quick-icon q-green"><Plus size={17}/></span><span><b>Create invoice</b><small>Record a new sale</small></span><ArrowRight size={15}/></button><button onClick={() => onAction("purchase")}><span className="quick-icon q-blue"><ShoppingCart size={17}/></span><span><b>Record purchase</b><small>Log supplier invoice</small></span><ArrowRight size={15}/></button><button onClick={() => onAction("expense")}><span className="quick-icon q-orange"><ReceiptIndianRupee size={17}/></span><span><b>Add an expense</b><small>Track where it goes</small></span><ArrowRight size={15}/></button></div>
    <div className="metric-grid">
      <Metric title="Today's sales" value={money(data?.sales)} change={`${money(data?.month_sales)} this month`} icon={ArrowUpRight} tone="green" sub="Revenue received today"/>
      <Metric title="Today's purchases" value={money(data?.purchases)} change={`${money(data?.month_purchases)} this month`} icon={ArrowDownRight} tone="blue" sub="Supplier bills recorded"/>
      <Metric title="Cash balance" value={money(data?.cash)} change="Across all transactions" icon={Wallet} tone="gold" sub="Available cash on hand"/>
      <Metric title="Bank balance" value={money(data?.bank)} change="Across all accounts" icon={Activity} tone="purple" sub="Available bank balance"/>
    </div>
    <div className="dashboard-main-grid">
      <Card className="revenue-card"><SectionHead title="Revenue overview" subtitle="Monthly sales & purchases · INR" action={<button className="select-chip" onClick={() => onNavigate("Reports")}>Last 6 months <ChevronDown size={14}/></button>}/><div className="chart-summary"><div><span>Total revenue</span><b>{money(data?.month_sales)}</b></div><div className="chart-legend"><span><i className="legend-sales"/>Sales</span><span><i className="legend-purchases"/>Purchases</span></div></div>{trend.length ? <div className="chart"><div className="chart-y"><span>₹{Math.round(max / 1000)}k</span><span>₹{Math.round(max / 2000)}k</span><span>₹0</span></div><div className="chart-plot"><div className="chart-gridlines"><i/><i/><i/></div><div className="chart-bars">{trend.map((row) => <div className="chart-group" key={row.month}><div className="bar-pair"><i className="bar-sales" style={{ height: `${Math.max(6, row.sales / max * 100)}%` }}/><i className="bar-purchase" style={{ height: `${Math.max(6, row.purchases / max * 100)}%` }}/></div><span>{new Date(`${row.month}-01`).toLocaleDateString("en-IN", { month: "short" })}</span></div>)}</div></div></div> : <EmptyState title="Your revenue chart is waiting" text="Add a few sales to see your monthly trends." action={<button className="text-button" onClick={() => onAction("invoice")}>Create an invoice <ArrowRight size={14}/></button>}/>}</Card>
      <Card className="insights-card"><SectionHead title="Profit & loss" subtitle="This month so far"/><div className="profit-amount">{money((data?.month_sales || 0) - (data?.month_purchases || 0) - (data?.month_expenses || 0))}<span className="profit-tag"><TrendingUp size={13}/> Net profit</span></div><div className="profit-lines"><div><span><i className="dot dot-green"/>Revenue</span><b>{money(data?.month_sales)}</b></div><div><span><i className="dot dot-blue"/>Purchases</span><b>{money(data?.month_purchases)}</b></div><div><span><i className="dot dot-orange"/>Expenses</span><b>{money(data?.month_expenses)}</b></div></div><button className="link-button" onClick={() => onNavigate("Accounting")}>View profit & loss <ArrowRight size={14}/></button><div className="insight-tip"><Sparkles size={15}/><span><b>Looking good</b> Your books are up to date. Keep recording transactions for sharper insights.</span></div></Card>
    </div>
    <div className="bottom-grid"><Card className="recent-card"><SectionHead title="Recent transactions" subtitle="Your latest business activity" action={<button className="link-button" onClick={() => onNavigate("Sales")}>View all <ArrowRight size={14}/></button>}/>{list.length ? <div className="table-wrap"><table><thead><tr><th>TRANSACTION</th><th>DATE</th><th>TYPE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>{list.slice(0, 5).map((row) => <tr key={row.id}><td><div className="transaction-name"><span className={`transaction-icon t-${row.type}`}><TransactionIcon type={String(row.type)}/></span><span><b>{row.party_name || row.category || row.description}</b><small>{row.number}</small></span></div></td><td>{formatDate(row.date)}</td><td><span className={`type-label type-${row.type}`}>{String(row.type).toUpperCase()}</span></td><td className="amount-cell">{money(row.amount)}</td><td><span className={`status-pill ${row.status === "paid" ? "status-paid" : "status-pending"}`}><i/>{String(row.status).toUpperCase()}</span></td></tr>)}</tbody></table></div> : <EmptyState title="No transactions just yet" text="Your latest sales, purchases and expenses will appear here." action={<PrimaryButton onClick={() => onAction("invoice")}>Create your first invoice</PrimaryButton>}/>}</Card>
      <div className="right-stack"><Card className="pending-card"><SectionHead title="Pending payments" action={<button className="round-arrow" onClick={() => onNavigate("Sales")}><ArrowRight size={15}/></button>}/><div className="pending-total">{money(data?.pending)}</div><div className="pending-bottom"><span>Across customer & supplier accounts</span><span className="pending-count"><span/> Needs follow-up</span></div></Card><Card className="stock-alert"><div className="alert-top"><span className="alert-icon"><Package size={17}/></span><span className="alert-count">{data?.lowStock || 0} items</span></div><b>Stock running low</b><p>A few items need a restock soon.</p><button className="link-button" onClick={() => onNavigate("Inventory")}>Check inventory <ArrowRight size={14}/></button></Card></div></div>
  </>;
}
function Metric({ title, value, change, icon: Icon, tone, sub }: { title: string; value: string; change: string; icon: typeof Wallet; tone: string; sub: string }) {
  return <Card className="metric-card"><div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}><Icon size={17}/></span></div><div className="metric-value">{value}</div><div className="metric-foot"><span>{change}</span><small>{sub}</small></div></Card>;
}
function TransactionIcon({ type }: { type: string }) {
  if (type === "sale" || type === "collection") return <ArrowDownLeft size={16}/>;
  if (type === "purchase" || type === "payment") return <ArrowUpRight size={16}/>;
  return <ReceiptIndianRupee size={16}/>;
}
function formatDate(date: unknown) { if (!date) return "—"; return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function useRows(api: (path: string, init?: RequestInit) => Promise<any>, path: string, refresh: number) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [fault, setFault] = useState("");
  useEffect(() => { setLoading(true); api(path).then((data) => { setRows(data); setFault(""); }).catch((err) => { const message = err instanceof Error ? err.message : "Unable to load records."; setFault(message); window.dispatchEvent(new CustomEvent("st-error", { detail: message })); }).finally(() => setLoading(false)); }, [api, path, refresh]);
  return { rows, loading, fault };
}
function SearchBox({ value, onChange, placeholder = "Search..." }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return <div className="search-box"><Search size={16}/><input placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)}/>{value && <button onClick={() => onChange("")}><X size={14}/></button>}</div>;
}
function TransactionsPage({ type, title, api, refresh, search, setSearch, onAction, setToast }: { type: string; title: string; api: (path: string, init?: RequestInit) => Promise<any>; refresh: number; search: string; setSearch: (s: string) => void; onAction: () => void; setToast: (message: string) => void }) {
  const { rows, loading } = useRows(api, `/transactions?type=${type}`, refresh);
  const filtered = useMemo(() => rows.filter((r) => `${r.party_name} ${r.number} ${r.category} ${r.description}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const total = rows.reduce((sum, row) => sum + cashNumber(row.amount), 0);
  const outstanding = rows.reduce((sum, row) => sum + Math.max(0, cashNumber(row.amount) - cashNumber(row.paid)), 0);
  const exportCsv = () => downloadCsv(`${type}-transactions.csv`, rows);
  const share = (row: Row) => {
    const text = `Invoice ${row.number} from Azees Smart Tally: ${money(row.amount)}. Date: ${formatDate(row.date)}.`;
    if (navigator.share) navigator.share({ title: `Invoice ${row.number}`, text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };
  const printInvoice = (row: Row) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setToast("Allow pop-ups to print this invoice."); return; }
    const safe = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
    printWindow.document.write(`<!doctype html><html><head><title>Invoice ${safe(row.number)}</title><style>body{font:15px Arial,sans-serif;color:#24342c;margin:48px auto;max-width:760px;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #236f50;padding-bottom:20px}h1{font-size:26px;margin:0 0 8px;color:#236f50}p{color:#617168}table{width:100%;border-collapse:collapse;margin-top:34px}td{padding:15px 10px;border-bottom:1px solid #dce6df}td:last-child{text-align:right;font-weight:bold}.total{font-size:21px;font-weight:bold;text-align:right;margin-top:25px}@media print{body{margin:20px auto}}</style></head><body><header><div><h1>Azees Smart Tally</h1><p>Tax invoice</p></div><div><b>${safe(row.number)}</b><p>${safe(formatDate(row.date))}</p></div></header><p><b>Bill to</b><br/>${safe(row.party_name || "Walk-in customer")}</p><table><tr><td>${safe(row.description || "Business goods and services")}</td><td>Subtotal&nbsp; ${safe(money(row.subtotal))}</td></tr><tr><td>GST</td><td>${safe(money(row.tax))}</td></tr></table><div class="total">Total&nbsp; ${safe(money(row.amount))}</div><p>Payment status: ${safe(row.status)}</p><script>window.onload=()=>{window.focus();window.print()}</script></body></html>`);
    printWindow.document.close();
  };
  const recordPayment = async (row: Row) => {
    const remaining = cashNumber(row.amount) - cashNumber(row.paid);
    const input = prompt(`Record a payment. Outstanding: ${money(remaining)}. Enter amount received:`, String(remaining));
    if (input === null) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { setToast(`Enter an amount from ₹0.01 to ${money(remaining)}.`); return; }
    try {
      await api(`/transactions/${row.id}/payment`, { method: "PATCH", body: JSON.stringify({ paid: cashNumber(row.paid) + amount }) });
      setToast("Payment recorded");
      window.dispatchEvent(new Event("st-refresh"));
    } catch (err) { setToast(err instanceof Error ? err.message : "Unable to record payment"); }
  };
  return <><PageHeading eyebrow={`WORKSPACE / ${type.toUpperCase()}`} title={title} subtitle={type === "sale" ? "Create GST invoices and keep customer payments in view." : type === "purchase" ? "Keep supplier bills, costs and outstanding payments organized." : "Track every business expense in one tidy place."} action={<PrimaryButton onClick={onAction}>{type === "sale" ? "New invoice" : type === "purchase" ? "Record purchase" : "Add expense"}</PrimaryButton>}/>
    <div className="summary-strip"><Card><span>{type === "sale" ? "Total sales" : type === "purchase" ? "Total purchases" : "Total expenses"}</span><b>{money(total)}</b><small>All recorded transactions</small></Card><Card><span>{type === "sale" ? "Collected" : type === "purchase" ? "Paid to vendors" : "Paid expenses"}</span><b>{money(rows.reduce((sum, row) => sum + cashNumber(row.paid), 0))}</b><small>Payments recorded</small></Card><Card><span>Outstanding</span><b className={outstanding ? "outstanding-color" : ""}>{money(outstanding)}</b><small>Awaiting settlement</small></Card></div>
    <Card className="listing-card"><SectionHead title="All transactions" subtitle={`${rows.length} records in your books`} action={<button className="secondary-button" onClick={exportCsv}><Download size={16}/>Export CSV</button>}/><div className="list-controls"><SearchBox value={search} onChange={setSearch} placeholder={`Search ${type}...`}/><button className="secondary-button filter-button"><Filter size={15}/>Filters</button></div>
    {loading ? <div className="loading-state">Loading transactions…</div> : filtered.length ? <div className="table-wrap"><table><thead><tr><th>REFERENCE</th><th>PARTY / DETAILS</th><th>DATE</th><th>SUBTOTAL</th><th>GST</th><th>TOTAL</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id}><td><b className="ref-code">{row.number}</b></td><td><b>{row.party_name || row.category || "—"}</b><small className="table-secondary">{row.description}</small></td><td>{formatDate(row.date)}</td><td>{money(row.subtotal)}</td><td>{money(row.tax)}</td><td className="amount-cell">{money(row.amount)}</td><td><span className={`status-pill ${row.status === "paid" ? "status-paid" : "status-pending"}`}><i/>{String(row.status).toUpperCase()}</span></td><td>{type === "sale" && <><button className="icon-button row-action" onClick={() => printInvoice(row)} title="Print or save invoice as PDF"><FileText size={15}/></button><button className="icon-button row-action" onClick={() => share(row)} title="Share invoice"><ArrowRight size={15}/></button></>}{(type === "sale" || type === "purchase") && row.status !== "paid" && <button className="icon-button row-action" onClick={() => recordPayment(row)} title="Record payment received"><Wallet size={15}/></button>}</td></tr>)}</tbody></table></div> : <EmptyState title={search ? "No matching transactions" : `No ${type} recorded yet`} text={search ? "Try another search term." : "Once you add a transaction, it will show up here."} action={!search && <PrimaryButton onClick={onAction}>{type === "sale" ? "Create first invoice" : type === "purchase" ? "Record first purchase" : "Add your first expense"}</PrimaryButton>}/>}</Card></>;
}
function LedgersPage({ api, refresh, search, setSearch, onAction, onEdit, setToast }: { api: (path: string, init?: RequestInit) => Promise<any>; refresh: number; search: string; setSearch: (s: string) => void; onAction: () => void; onEdit: (row: Row) => void; setToast: (s: string) => void }) {
  const { rows, loading } = useRows(api, `/ledgers?search=${encodeURIComponent(search)}`, refresh);
  const remove = async (id: unknown) => { if (!confirm("Delete this ledger? Existing transactions remain in your books.")) return; try { await api(`/ledgers/${id}`, { method: "DELETE" }); setToast("Ledger deleted"); window.dispatchEvent(new Event("st-refresh")); } catch (e) { setToast(e instanceof Error ? e.message : "Could not delete ledger"); } };
  return <><PageHeading eyebrow="WORKSPACE / RELATIONSHIPS" title="Your ledgers" subtitle="Customers, suppliers and accounts — all in one place." action={<PrimaryButton onClick={onAction}>Add ledger</PrimaryButton>}/><div className="summary-strip"><Card><span>Total ledgers</span><b>{rows.length}</b><small>Accounts in your workspace</small></Card><Card><span>Customers</span><b>{rows.filter((r) => r.type === "customer").length}</b><small>Customer accounts</small></Card><Card><span>Suppliers</span><b>{rows.filter((r) => r.type === "vendor").length}</b><small>Vendor accounts</small></Card></div><Card className="listing-card"><SectionHead title="All ledgers" subtitle="Search and manage your account relationships"/><div className="list-controls"><SearchBox value={search} onChange={setSearch} placeholder="Search by name, phone or GSTIN..."/><button className="secondary-button filter-button"><Filter size={15}/>All types <ChevronDown size={14}/></button></div>{loading ? <div className="loading-state">Loading ledgers…</div> : rows.length ? <div className="table-wrap"><table><thead><tr><th>NAME</th><th>TYPE</th><th>PHONE</th><th>GSTIN</th><th>OPENING BALANCE</th><th/></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="ledger-cell"><span className={`ledger-avatar l-${row.type}`}>{String(row.name).slice(0, 1).toUpperCase()}</span><div><b>{row.name}</b><small>{row.email || row.address || "—"}</small></div></div></td><td><span className={`type-label type-${row.type}`}>{String(row.type).toUpperCase()}</span></td><td>{row.phone || "—"}</td><td>{row.gstin || "—"}</td><td className="amount-cell">{money(row.opening_balance)} <small>{row.balance_type}</small></td><td><button className="icon-button row-action" onClick={() => onEdit(row)} title="Edit ledger"><Settings size={15}/></button><button className="icon-button row-action" onClick={() => remove(row.id)} title="Delete ledger"><X size={16}/></button></td></tr>)}</tbody></table></div> : <EmptyState title="Start with a ledger" text="Add a customer or supplier to keep every transaction connected." action={<PrimaryButton onClick={onAction}>Add your first ledger</PrimaryButton>}/>}</Card></>;
}
function InventoryPage({ api, refresh, search, setSearch, onAction, setToast }: { api: (path: string, init?: RequestInit) => Promise<any>; refresh: number; search: string; setSearch: (s: string) => void; onAction: () => void; setToast: (s: string) => void }) {
  const { rows, loading } = useRows(api, "/items", refresh);
  const filtered = rows.filter((row) => `${row.name} ${row.sku} ${row.category} ${row.barcode}`.toLowerCase().includes(search.toLowerCase()));
  const totalValue = rows.reduce((sum, r) => sum + cashNumber(r.quantity) * cashNumber(r.purchase_price), 0);
  const stockChange = async (item: Row, movement: string) => {
    const raw = prompt(`${movement === "in" ? "Add stock" : movement === "out" ? "Remove stock" : "Set stock level"} for ${item.name}:`, "1");
    if (raw === null) return;
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) { setToast("Enter a quantity greater than zero."); return; }
    try { await api(`/items/${item.id}/stock`, { method: "POST", body: JSON.stringify({ movement, quantity, note: "Inventory adjustment" }) }); setToast("Stock updated"); window.dispatchEvent(new Event("st-refresh")); }
    catch (err) { setToast(err instanceof Error ? err.message : "Unable to update stock"); }
  };
  return <><PageHeading eyebrow="WORKSPACE / CATALOG" title="Inventory" subtitle="Keep an eye on stock levels, costs and product performance." action={<PrimaryButton onClick={onAction}>Add item</PrimaryButton>}/><div className="summary-strip"><Card><span>Products</span><b>{rows.length}</b><small>Items in your catalog</small></Card><Card><span>Stock value</span><b>{money(totalValue)}</b><small>At purchase price</small></Card><Card><span>Low stock alerts</span><b className={rows.some((r) => cashNumber(r.quantity) <= cashNumber(r.low_stock)) ? "outstanding-color" : ""}>{rows.filter((r) => cashNumber(r.quantity) <= cashNumber(r.low_stock)).length}</b><small>Items at or below minimum</small></Card></div><Card className="listing-card"><SectionHead title="Item master" subtitle="Product list with live stock levels"/><div className="list-controls"><SearchBox value={search} onChange={setSearch} placeholder="Search item, SKU or barcode..."/><button className="secondary-button filter-button"><ScanBarcode size={15}/>Scan barcode</button></div>{loading ? <div className="loading-state">Loading items…</div> : filtered.length ? <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>SKU / BARCODE</th><th>CATEGORY</th><th>IN STOCK</th><th>BUY PRICE</th><th>SELL PRICE</th><th>STOCK VALUE</th><th>ACTIONS</th></tr></thead><tbody>{filtered.map((row) => { const low = cashNumber(row.quantity) <= cashNumber(row.low_stock); return <tr key={row.id}><td><div className="ledger-cell"><span className="item-avatar"><Package size={16}/></span><div><b>{row.name}</b><small>{row.unit}</small></div></div></td><td><b className="ref-code">{row.sku || "—"}</b><small className="table-secondary">{row.barcode}</small></td><td>{row.category || "—"}</td><td><span className={`stock-level ${low ? "stock-low" : ""}`}>{row.quantity} {row.unit}</span>{low && <small className="low-label">Low stock</small>}</td><td>{money(row.purchase_price)}</td><td>{money(row.selling_price)}</td><td className="amount-cell">{money(cashNumber(row.quantity) * cashNumber(row.purchase_price))}</td><td><button className="icon-button row-action" onClick={() => stockChange(row, "in")} title="Stock in"><Plus size={16}/></button><button className="icon-button row-action" onClick={() => stockChange(row, "out")} title="Stock out"><ArrowDownRight size={16}/></button><button className="icon-button row-action" onClick={() => stockChange(row, "adjustment")} title="Adjust stock to a new quantity"><Settings size={15}/></button></td></tr>; })}</tbody></table></div> : <EmptyState title="Your catalog starts here" text="Add the products you sell and track stock as it moves." action={<PrimaryButton onClick={onAction}>Add your first item</PrimaryButton>}/>}</Card></>;
}
function AccountingPage({ api, refresh, setToast }: { api: (path: string, init?: RequestInit) => Promise<any>; refresh: number; setToast: (s: string) => void }) {
  const [pl, setPl] = useState<Row>({});
  const [trial, setTrial] = useState<Row[]>([]);
  const [balance, setBalance] = useState<Row>({});
  useEffect(() => { Promise.all([api("/reports/profit-loss"), api("/reports/trial-balance"), api("/reports/balance-sheet")]).then(([p, t, b]) => { setPl(p); setTrial(t); setBalance(b); }).catch((e) => setToast(e.message)); }, [api, refresh, setToast]);
  const profit = cashNumber(pl.revenue) - cashNumber(pl.purchases) - cashNumber(pl.expenses);
  return <><PageHeading eyebrow="INSIGHTS / BOOKS" title="Accounting" subtitle="A clear view of your books, balances and business health."/><div className="accounting-hero"><div><div className="eyebrow">PROFIT & LOSS · THIS MONTH</div><h2>{money(profit)}</h2><span>Net profit / (loss)</span></div><div className="accounting-hero-icon"><BookOpen size={25}/></div></div><div className="metric-grid accounting-metrics"><Metric title="Revenue" value={money(pl.revenue)} change="Sales invoices" icon={ArrowDownLeft} tone="green" sub="This period"/><Metric title="Purchases" value={money(pl.purchases)} change="Supplier bills" icon={ShoppingCart} tone="blue" sub="This period"/><Metric title="Operating expenses" value={money(pl.expenses)} change="Recorded expenses" icon={ReceiptIndianRupee} tone="orange" sub="This period"/><Metric title="Net margin" value={`${cashNumber(pl.revenue) ? (profit / cashNumber(pl.revenue) * 100).toFixed(1) : "0.0"}%`} change="Profit as % of revenue" icon={TrendingUp} tone="purple" sub="This period"/></div><div className="accounting-grid"><Card><SectionHead title="Balance sheet snapshot" subtitle="Assets, receivables & payables"/><div className="balance-list">{[["Cash on hand",balance.cash],["Bank accounts",balance.bank],["Inventory value",balance.inventory],["Customer receivables",balance.receivables],["Vendor payables",balance.payables]].map(([label,value])=><div key={String(label)}><span>{label}</span><b>{money(value as number)}</b></div>)}</div></Card><Card><SectionHead title="Accounting books" subtitle="Reports built from recorded transactions"/><div className="book-links">{[["Day book","Daily transactions and entries"],["Cash book","Cash receipts and payments"],["Bank book","Bank movement summary"],["Profit & loss","Income and expense statement"],["Balance sheet","Snapshot of assets and liabilities"]].map(([name,desc])=><button key={name} onClick={() => setToast(`${name} uses the current recorded transactions.`)}><span className="book-link-icon"><FileBarChart size={17}/></span><span><b>{name}</b><small>{desc}</small></span><ArrowRight size={15}/></button>)}</div></Card></div><Card className="listing-card"><SectionHead title="Trial balance" subtitle="Ledger balances for a quick account check"/>{trial.length ? <div className="table-wrap"><table><thead><tr><th>ACCOUNT</th><th>TYPE</th><th>OPENING</th><th>ACTIVITY</th><th>CURRENT BALANCE</th></tr></thead><tbody>{trial.map((row)=><tr key={row.id}><td><b>{row.name}</b></td><td><span className="type-label">{String(row.type).toUpperCase()}</span></td><td>{money(row.opening_balance)}</td><td>{money(row.activity)}</td><td className="amount-cell">{money(row.balance)}</td></tr>)}</tbody></table></div>:<EmptyState title="No ledgers to balance" text="Add a ledger to see its trial balance."/>}</Card></>;
}
function ReportsPage({ api, refresh }: { api: (path: string, init?: RequestInit) => Promise<any>; refresh: number }) {
  const { rows } = useRows(api, "/transactions", refresh);
  const [pl, setPl] = useState<Row>({});
  useEffect(() => { api("/reports/profit-loss").then(setPl).catch(() => setPl({})); }, [api, refresh]);
  const exportReport = () => downloadCsv("smart-tally-transactions.csv", rows);
  const grouped = useMemo(() => {
    const result: Record<string, { sales: number; purchases: number; expenses: number }> = {};
    rows.forEach((row) => { const key = String(row.date).slice(0, 7); result[key] ||= { sales: 0, purchases: 0, expenses: 0 }; if (row.type === "sale") result[key].sales += cashNumber(row.amount); if (row.type === "purchase") result[key].purchases += cashNumber(row.amount); if (row.type === "expense") result[key].expenses += cashNumber(row.amount); });
    return Object.entries(result).sort(([a], [b]) => b.localeCompare(a));
  }, [rows]);
  return <><PageHeading eyebrow="INSIGHTS / REPORTING" title="Reports" subtitle="Make more confident decisions with a clear view of your numbers." action={<button className="secondary-button" onClick={exportReport}><Download size={16}/>Export Excel / CSV</button>}/><div className="report-cards"><Card><div className="report-icon ri-green"><TrendingUp size={19}/></div><small>THIS MONTH · REVENUE</small><b>{money(pl.revenue)}</b><span>Sales recorded this month</span></Card><Card><div className="report-icon ri-orange"><ArrowUpRight size={19}/></div><small>THIS MONTH · SPENDING</small><b>{money(cashNumber(pl.purchases)+cashNumber(pl.expenses))}</b><span>Purchases and expenses</span></Card><Card><div className="report-icon ri-purple"><FileBarChart size={19}/></div><small>ALL TIME · ACTIVITY</small><b>{rows.length}</b><span>Transactions in your books</span></Card></div><Card className="listing-card"><SectionHead title="Monthly summary" subtitle="Sales, purchases and expenses by month" action={<span className="period-label"><CalendarDays size={14}/>All recorded time</span>}/>{grouped.length ? <div className="table-wrap"><table><thead><tr><th>PERIOD</th><th>SALES</th><th>PURCHASES</th><th>EXPENSES</th><th>NET PROFIT</th></tr></thead><tbody>{grouped.map(([month, value])=><tr key={month}><td><b>{new Date(`${month}-01`).toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</b></td><td>{money(value.sales)}</td><td>{money(value.purchases)}</td><td>{money(value.expenses)}</td><td className="amount-cell">{money(value.sales-value.purchases-value.expenses)}</td></tr>)}</tbody></table></div>:<EmptyState title="Reports are ready when you are" text="Record transactions to see your business performance over time."/>}</Card><div className="report-export-row"><div><b>Need a copy for your records?</b><span>Download your transaction report as a spreadsheet-friendly CSV file.</span></div><button className="secondary-button" onClick={exportReport}><Download size={16}/>Download report</button></div></>;
}
function ToolsPage({ api, refresh, onAction, setToast }: { api: (path: string, init?: RequestInit) => Promise<any>; refresh: number; onAction: (a: string) => void; setToast: (s: string) => void }) {
  const { rows: notes } = useRows(api, "/notes", refresh);
  const [numA, setNumA] = useState(""); const [rate, setRate] = useState("18");
  const [principal, setPrincipal] = useState(""); const [interest, setInterest] = useState(""); const [months, setMonths] = useState("");
  const gst = cashNumber(numA) * cashNumber(rate) / 100;
  const emiRate = cashNumber(interest) / 1200; const emiN = cashNumber(months);
  const emi = emiN && cashNumber(principal) ? cashNumber(principal) * emiRate * Math.pow(1 + emiRate, emiN) / (Math.pow(1 + emiRate, emiN) - 1) : 0;
  const addNote = async () => {
    const title = prompt("Note title");
    if (!title) return;
    try { await api("/notes", { method: "POST", body: JSON.stringify({ title, body: "" }) }); setToast("Note saved"); window.dispatchEvent(new Event("st-refresh")); }
    catch (e) { setToast(e instanceof Error ? e.message : "Could not save note"); }
  };
  return <><PageHeading eyebrow="YOUR WORKSPACE / EXTRAS" title="Tools & notes" subtitle="A few handy tools to keep your everyday work moving."/><div className="tools-grid"><Card className="tool-card"><div className="tool-header"><span className="tool-icon tool-green"><Calculator size={20}/></span><span className="tool-available">READY</span></div><h3>GST calculator</h3><p>Quickly calculate the GST component on any amount.</p><label>Amount before tax<input type="number" min="0" value={numA} onChange={(e)=>setNumA(e.target.value)} placeholder="e.g. 10,000"/></label><label>GST rate<select value={rate} onChange={(e)=>setRate(e.target.value)}><option value="0">0%</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></label><div className="calc-result"><span>GST amount <b>{money(gst)}</b></span><span>Total incl. GST <b>{money(cashNumber(numA)+gst)}</b></span></div></Card><Card className="tool-card"><div className="tool-header"><span className="tool-icon tool-blue"><Wallet size={20}/></span><span className="tool-available">READY</span></div><h3>EMI calculator</h3><p>Estimate monthly repayments for your next big decision.</p><label>Loan amount<input type="number" min="0" value={principal} onChange={(e)=>setPrincipal(e.target.value)} placeholder="e.g. 5,00,000"/></label><div className="input-pair"><label>Annual interest %<input type="number" min="0" value={interest} onChange={(e)=>setInterest(e.target.value)} placeholder="10"/></label><label>Tenure (months)<input type="number" min="1" value={months} onChange={(e)=>setMonths(e.target.value)} placeholder="36"/></label></div><div className="calc-result"><span>Estimated monthly EMI <b>{money(emi)}</b></span><span>Total repayment <b>{money(emi*emiN)}</b></span></div></Card><Card className="tool-card"><div className="tool-header"><span className="tool-icon tool-purple"><NotebookPen size={20}/></span><button className="icon-button" onClick={addNote} title="Add note"><Plus size={17}/></button></div><h3>Notes & reminders</h3><p>Keep a thought close while you work.</p><div className="notes-list">{notes.length ? notes.map((note)=><div key={note.id}><span className="note-dot"/><span><b>{note.title}</b><small>{note.body || "Personal note"}</small></span></div>) : <div className="notes-empty">No notes yet. Add a note for something you want to remember.</div>}</div><button className="secondary-button full-button" onClick={addNote}><Plus size={15}/>Add a note</button></Card><Card className="tool-card tool-placeholder"><div className="tool-header"><span className="tool-icon tool-orange"><ScanBarcode size={20}/></span><span className="coming-soon">COMING SOON</span></div><h3>QR & barcode tools</h3><p>Product code scanning and payment QR tools are ready for a future integration.</p><button className="text-button" onClick={()=>setToast("Barcode scanning works best on a device with a supported camera. Integration can be enabled next.")}>Learn more <ArrowRight size={15}/></button></Card></div><div className="tools-shortcuts"><b>Quick actions</b><button onClick={()=>onAction("invoice")}><FileText size={17}/> Create an invoice <ArrowRight size={15}/></button><button onClick={()=>onAction("expense")}><ReceiptIndianRupee size={17}/> Track an expense <ArrowRight size={15}/></button></div></>;
}
function SettingsPage({ api, setToast, signOut }: { api: (path: string, init?: RequestInit) => Promise<any>; setToast: (s: string) => void; signOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<Row[]>([]);
  useEffect(() => { api("/audit").then(setLogs).catch(()=>setLogs([])); }, [api]);
  const exportDb = async () => {
    setBusy(true);
    try { const response = await fetch(apiUrl("/backup"), { headers: { Authorization: `Bearer ${localStorage.getItem("st_token")}` } }); if (!response.ok) throw new Error("Backup download failed"); const blob = await response.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download="azees-smart-tally-backup.sqlite"; a.click(); URL.revokeObjectURL(url); setToast("Database backup downloaded"); }
    catch (err) { setToast(err instanceof Error ? err.message : "Backup failed"); } finally { setBusy(false); }
  };
  const exportJson = async () => {
    try { const data = await api("/backup/json"); const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url;a.download="smart-tally-backup.json";a.click();URL.revokeObjectURL(url);setToast("Portable backup downloaded"); } catch(e){setToast(e instanceof Error?e.message:"Backup failed");}
  };
  const restoreJson = async (file?: File) => {
    if (!file) return;
    if (!confirm("Restore replaces all current ledgers, transactions, items and notes. Continue?")) return;
    try { const backup=JSON.parse(await file.text()); await api("/backup/restore",{method:"POST",body:JSON.stringify(backup)}); setToast("Backup restored"); window.dispatchEvent(new Event("st-refresh")); }
    catch(e) { setToast(e instanceof Error ? e.message : "Backup restore failed"); }
  };
  return <><PageHeading eyebrow="WORKSPACE / PREFERENCES" title="Settings" subtitle="Manage your workspace, data and security."/><div className="settings-grid"><Card><SectionHead title="Workspace" subtitle="Your personal business setup"/><div className="settings-profile"><span className="settings-avatar">A</span><span><b>Azees' Business</b><small>Owner workspace · INR (₹)</small></span></div><div className="settings-row"><span><b>Authorized account</b><small>Only this email can access the workspace.</small></span><span className="settings-value">abdulazees3121@gmail.com <ShieldCheck size={14}/></span></div><div className="settings-row"><span><b>Session security</b><small>Automatically signs out after inactivity.</small></span><span className="status-pill status-paid"><i/>ENABLED</span></div><div className="settings-row"><span><b>Activity log</b><small>{logs.length} recent security and workspace events.</small></span><span className="settings-value"><Activity size={16}/> Active</span></div></Card><Card><SectionHead title="Data & backups" subtitle="Keep a safe copy of your business records"/><div className="backup-callout"><span><ShieldCheck size={18}/></span><div><b>Your data stays yours</b><small>Download a SQLite snapshot or portable JSON backup at any time.</small></div></div><button className="backup-button" onClick={exportDb} disabled={busy}><Download size={17}/><span><b>{busy?"Preparing…":"Export database"}</b><small>Full SQLite backup file</small></span><ArrowRight size={16}/></button><button className="backup-button" onClick={exportJson}><FileText size={17}/><span><b>Download portable backup</b><small>JSON export of your business data</small></span><ArrowRight size={16}/></button><label className="backup-button file-backup"><Download size={17}/><span><b>Restore from JSON</b><small>Replaces existing transaction data</small></span><ArrowRight size={16}/><input type="file" accept="application/json,.json" onChange={(e)=>{void restoreJson(e.target.files?.[0]);e.target.value="";}}/></label><button className="backup-button signout-row" onClick={signOut}><LogOut size={17}/><span><b>Sign out</b><small>End this workspace session</small></span><ArrowRight size={16}/></button></Card></div><Card className="listing-card"><SectionHead title="Recent activity" subtitle="Audit trail of access and workspace changes"/>{logs.length?<div className="table-wrap"><table><thead><tr><th>EVENT</th><th>AREA</th><th>DETAIL</th><th>TIME</th></tr></thead><tbody>{logs.slice(0,12).map((row)=><tr key={row.id}><td><span className="type-label">{row.action}</span></td><td>{row.entity}</td><td>{row.details||"—"}</td><td>{new Date(String(row.created_at)+"Z").toLocaleString()}</td></tr>)}</tbody></table></div>:<EmptyState title="Your activity log is ready" text="Sign-ins and business changes will be recorded here."/>}</Card></>;
}

function EntryModal({ type, api, initial, onClose, onSaved, onError }: { type: "sale" | "purchase" | "expense" | "ledger" | "item" | "note"; api: (path: string, init?: RequestInit) => Promise<any>; initial?: Row; onClose: () => void; onSaved: () => void; onError: (error: string) => void }) {
  const [ledgers, setLedgers] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => ({
    date: dateToday(), payment_mode: "cash", tax_rate: "18", paid: "", type: type === "sale" ? "customer" : "vendor",
    balance_type: "receivable", quantity: "0", low_stock: "5", unit: "pcs", movement: "in",
    ...Object.fromEntries(Object.entries(initial || {}).map(([key, value]) => [key, String(value ?? "")]))
  }));
  useEffect(() => { api("/ledgers").then(setLedgers).catch(() => setLedgers([])); }, [api]);
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const isLedger = type === "ledger"; const isItem = type === "item"; const isNote = type === "note";
  const title = isLedger ? initial ? "Edit ledger" : "Add a ledger" : isItem ? "Add inventory item" : isNote ? "Add a note" : type === "sale" ? "Create sales invoice" : type === "purchase" ? "Record a purchase" : "Add an expense";
  const subtotal = cashNumber(form.subtotal || form.amount); const tax = subtotal * cashNumber(form.tax_rate) / 100; const total = subtotal + tax;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      if (isLedger) await api(initial ? `/ledgers/${initial.id}` : "/ledgers", { method: initial ? "PUT" : "POST", body: JSON.stringify({ ...form, opening_balance: Number(form.opening_balance || 0) }) });
      else if (isItem) await api("/items", { method: "POST", body: JSON.stringify({ ...form, quantity: Number(form.quantity || 0), low_stock: Number(form.low_stock || 5), purchase_price: Number(form.purchase_price || 0), selling_price: Number(form.selling_price || 0) }) });
      else if (isNote) await api("/notes", { method: "POST", body: JSON.stringify(form) });
      else {
        const typeName = type!;
        const ledger = ledgers.find((row) => String(row.id) === form.party_id);
        await api("/transactions", { method: "POST", body: JSON.stringify({
          type: typeName, date: form.date, party_id: form.party_id ? Number(form.party_id) : null,
          party_name: ledger?.name || form.party_name || form.category || "", category: form.category || "",
          description: form.description || "", subtotal, tax, amount: total || Number(form.amount),
          payment_mode: form.payment_mode, paid: Number(form.paid || 0)
        }) });
      }
      onSaved();
    } catch (err) { onError(err instanceof Error ? err.message : "Could not save this entry."); }
    finally { setSaving(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose();}}><form className="entry-modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">{isLedger?"RELATIONSHIPS":isItem?"INVENTORY":isNote?"PERSONAL":"TRANSACTION"}</div><h2>{title}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19}/></button></div>
    <div className="modal-body">
      {isLedger && <><label>Ledger name <input required autoFocus value={form.name||""} onChange={(e)=>set("name",e.target.value)} placeholder="e.g. Sunrise Traders"/></label><div className="field-grid"><label>Account type<select value={form.type} onChange={(e)=>set("type",e.target.value)}><option value="customer">Customer</option><option value="vendor">Vendor</option><option value="bank">Bank account</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label>Phone number<input value={form.phone||""} onChange={(e)=>set("phone",e.target.value)} placeholder="+91"/></label></div><div className="field-grid"><label>Email<input type="email" value={form.email||""} onChange={(e)=>set("email",e.target.value)} placeholder="accounts@example.com"/></label><label>GSTIN<input value={form.gstin||""} onChange={(e)=>set("gstin",e.target.value.toUpperCase())} placeholder="GST identification number"/></label></div><div className="field-grid"><label>Opening balance<input type="number" min="0" step="0.01" value={form.opening_balance||""} onChange={(e)=>set("opening_balance",e.target.value)} placeholder="0"/></label><label>Balance type<select value={form.balance_type} onChange={(e)=>set("balance_type",e.target.value)}><option value="receivable">Receivable</option><option value="payable">Payable</option></select></label></div><label>Address<textarea value={form.address||""} onChange={(e)=>set("address",e.target.value)} placeholder="Business address"/></label></>}
      {isItem && <><label>Item name<input required autoFocus value={form.name||""} onChange={(e)=>set("name",e.target.value)} placeholder="e.g. Premium Tea 500g"/></label><div className="field-grid"><label>SKU<input value={form.sku||""} onChange={(e)=>set("sku",e.target.value)} placeholder="TEA-500"/></label><label>Category<input value={form.category||""} onChange={(e)=>set("category",e.target.value)} placeholder="Groceries"/></label></div><div className="field-grid"><label>Barcode<input value={form.barcode||""} onChange={(e)=>set("barcode",e.target.value)} placeholder="Scan or enter barcode"/></label><label>Unit<input value={form.unit} onChange={(e)=>set("unit",e.target.value)} placeholder="pcs"/></label></div><div className="field-grid"><label>Opening stock<input type="number" min="0" step=".01" value={form.quantity} onChange={(e)=>set("quantity",e.target.value)}/></label><label>Low stock alert at<input type="number" min="0" step=".01" value={form.low_stock} onChange={(e)=>set("low_stock",e.target.value)}/></label></div><div className="field-grid"><label>Purchase price<input type="number" min="0" step=".01" value={form.purchase_price||""} onChange={(e)=>set("purchase_price",e.target.value)} placeholder="₹0.00"/></label><label>Selling price<input type="number" min="0" step=".01" value={form.selling_price||""} onChange={(e)=>set("selling_price",e.target.value)} placeholder="₹0.00"/></label></div></>}
      {isNote && <><label>Note title<input required autoFocus value={form.title||""} onChange={(e)=>set("title",e.target.value)} placeholder="What do you want to remember?"/></label><label>Details<textarea value={form.body||""} onChange={(e)=>set("body",e.target.value)} placeholder="Add a few details…"/></label><label>Reminder date<input type="date" value={form.reminder_at||""} onChange={(e)=>set("reminder_at",e.target.value)}/></label></>}
      {!isLedger&&!isItem&&!isNote && <><div className="field-grid"><label>Date<input type="date" required value={form.date} onChange={(e)=>set("date",e.target.value)}/></label><label>{type==="expense"?"Expense category":type==="sale"?"Customer":"Supplier"}{type==="expense"?<select required value={form.category||""} onChange={(e)=>set("category",e.target.value)}><option value="">Choose category</option>{["Fuel","Salary","Office","Travel","Miscellaneous"].map((x)=><option key={x}>{x}</option>)}</select>:<select value={form.party_id||""} onChange={(e)=>set("party_id",e.target.value)}><option value="">Walk-in / not linked</option>{ledgers.filter((l)=>l.type===(type==="sale"?"customer":"vendor")).map((l)=><option key={l.id} value={String(l.id ?? "")}>{l.name}</option>)}</select>}</label></div><label>{type==="expense"?"Description":"Invoice notes"}<input value={form.description||""} onChange={(e)=>set("description",e.target.value)} placeholder={type==="expense"?"e.g. Fuel for delivery van":"Optional description"}/></label><div className="field-grid"><label>{type==="expense"?"Amount before tax":"Subtotal"}<input type="number" min="0.01" step=".01" required value={form.subtotal||form.amount||""} onChange={(e)=>{set("subtotal",e.target.value);set("amount",e.target.value);}} placeholder="0.00"/></label><label>GST rate<select value={form.tax_rate} onChange={(e)=>set("tax_rate",e.target.value)}><option value="0">No GST</option><option value="5">5%</option><option value="12">12%</option><option value="18">18%</option><option value="28">28%</option></select></label></div><div className="field-grid"><label>Payment method<select value={form.payment_mode} onChange={(e)=>set("payment_mode",e.target.value)}><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="credit">Credit / later</option></select></label><label>Amount paid<input type="number" min="0" step=".01" value={form.paid||""} onChange={(e)=>set("paid",e.target.value)} placeholder="0.00"/></label></div><div className="invoice-total"><span><small>Subtotal</small><b>{money(subtotal)}</b></span><span><small>GST</small><b>{money(tax)}</b></span><span><small>Total due</small><b>{money(total)}</b></span></div></>}
    </div><div className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={saving}>{saving?"Saving…":<>{isLedger?"Save ledger":isItem?"Save item":isNote?"Save note":type==="sale"?"Create invoice":type==="purchase"?"Record purchase":"Save expense"} <ArrowRight size={16}/></>}</button></div></form></div>;
}
function downloadCsv(name: string, rows: Row[]) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => `"${String(row[column] ?? "").replaceAll('"', '""')}"`).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff"+csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href=url; link.download=name; link.click(); URL.revokeObjectURL(url);
}
