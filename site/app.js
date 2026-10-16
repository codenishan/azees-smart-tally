(() => {
  "use strict";

  const OWNER_EMAIL = "abdulazees3121@gmail.com";
  const DB_NAME = "smart-tally-local";
  const DB_VERSION = 1;
  const tabs = ["Overview", "Sales", "Purchases", "Expenses", "Inventory", "Ledgers", "Accounting", "Reports", "Tools", "Settings"];
  const symbols = {
    Overview: "▦", Sales: "↗", Purchases: "↙", Expenses: "₹", Inventory: "▤",
    Ledgers: "♧", Accounting: "▤", Reports: "▥", Tools: "✦", Settings: "⚙",
    Menu: "☰", Close: "×", Moon: "◐", Sun: "☼", Add: "+", Search: "⌕",
    More: "•••", Arrow: "→", Download: "↓", File: "▤", Wallet: "▱",
    Chart: "⌁", Bell: "♧", Check: "✓", Shield: "◇", Package: "▣"
  };
  const blankData = () => ({
    version: 1,
    ledgers: [],
    transactions: [],
    items: [],
    stock_movements: [],
    notes: [],
    audit_logs: []
  });
  let db;
  let data = blankData();
  let tab = "Overview";
  let search = "";
  let dark = localStorage.getItem("st_theme") === "dark";
  let modal = null;
  let toastTimer;
  const root = document.getElementById("root");

  const today = () => new Date().toISOString().slice(0, 10);
  const money = (value) => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0
  }).format(Number(value) || 0);
  const number = (value) => Number(value) || 0;
  const id = () => Date.now() + Math.floor(Math.random() * 1000);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const fmtDate = (value) => value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";
  const icon = (name) => `<span class="plain-icon" aria-hidden="true">${symbols[name] || "•"}</span>`;
  const active = (rows) => rows.filter((row) => !row.deleted_at);
  const card = (content, cls = "") => `<section class="card ${cls}">${content}</section>`;
  const empty = (title, text, action = "") => `<div class="empty-state"><div class="empty-icon">${icon("File")}</div><b>${esc(title)}</b><span>${esc(text)}</span>${action}</div>`;
  const heading = (eyebrow, title, subtitle, action = "") => `<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action ? `<div class="heading-action">${action}</div>` : ""}</div>`;
  const button = (label, action, secondary = false) => `<button class="${secondary ? "secondary-button" : "primary-button"}" data-action="${esc(action)}">${icon("Add")}${esc(label)}</button>`;
  const sectionHead = (title, subtitle = "", action = "") => `<div class="section-head"><div><h3>${esc(title)}</h3>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>${action}</div>`;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => request.result.createObjectStore("workspace");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open this browser's local database."));
    });
  }

  function loadData() {
    return new Promise((resolve, reject) => {
      const request = db.transaction("workspace").objectStore("workspace").get("current");
      request.onsuccess = () => resolve(request.result || blankData());
      request.onerror = () => reject(request.error || new Error("Unable to read local business data."));
    });
  }

  function saveData() {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("workspace", "readwrite");
      transaction.objectStore("workspace").put(data, "current");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save local business data."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving local business data was cancelled."));
    });
  }

  function audit(action, entity, details = "") {
    data.audit_logs.unshift({ id: id(), action, entity, details, created_at: new Date().toISOString() });
    data.audit_logs = data.audit_logs.slice(0, 200);
  }

  async function persist(message = "") {
    try {
      await saveData();
      render();
      if (message) notify(message);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to save your changes.");
    }
  }

  function notify(message) {
    document.querySelector(".toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `${icon("Check")}${esc(message)}`;
    document.body.append(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 3000);
  }

  function showError(message) {
    document.querySelector(".toast-error")?.remove();
    const toast = document.createElement("div");
    toast.className = "toast toast-error";
    toast.innerHTML = `${esc(message)}<button class="icon-button" data-action="dismiss-error" aria-label="Dismiss">×</button>`;
    document.body.append(toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.remove(), 6000);
  }

  function status(amount, paid) {
    return paid >= amount ? "paid" : paid > 0 ? "partial" : "unpaid";
  }

  function nextNumber(type) {
    const prefix = { sale: "INV", purchase: "PUR", expense: "EXP", collection: "COL", payment: "PAY" }[type];
    const stamp = today().replaceAll("-", "");
    const start = `${prefix}-${stamp}-`;
    const sequence = data.transactions.filter((row) => row.number?.startsWith(start))
      .reduce((max, row) => Math.max(max, Number(row.number.slice(-3)) || 0), 0) + 1;
    return `${start}${String(sequence).padStart(3, "0")}`;
  }

  function loginView() {
    const configured = Boolean(localStorage.getItem("st_local_lock"));
    return `<div class="login-screen">
      <div class="login-art"><div class="art-grid"></div><div class="art-content">
        <div class="brand login-brand"><span class="brand-icon">${icon("Overview")}</span><div><b>Smart Tally Mobile</b><small>AZEES' PERSONAL EDITION</small></div></div>
        <div class="art-copy"><div class="eyebrow"><span></span> YOUR BUSINESS, IN BALANCE</div><h1>Clarity for every<br><em>rupee earned.</em></h1>
          <p>Your business finances, inventory and insights — in one private workspace made for you, Azees.</p>
          <div class="art-stats"><div><b>01</b><span>Stored in this browser</span></div><div><b>02</b><span>Back up your own records</span></div></div>
        </div>
        <div class="art-footer">${icon("Shield")} Device-local workspace</div>
      </div></div>
      <div class="login-panel"><form class="login-form" id="login-form" data-mode="${configured ? "unlock" : "setup"}">
        <div class="login-welcome"><span class="login-mark">${icon("Overview")}</span><div class="eyebrow">${configured ? "WELCOME BACK" : "FIRST-TIME SETUP"}</div>
          <h2>${configured ? "Unlock your<br>workspace" : "Create a local<br>workspace lock"}</h2>
          <p>${configured ? "Your records are saved in this browser." : "Choose a passphrase to keep this browser session private."}</p></div>
        <label>Email address<div class="input-wrap">${icon("Ledgers")}<input type="email" name="email" required value="${OWNER_EMAIL}" autocomplete="username"></div></label>
        <label>${configured ? "Passphrase" : "Choose a passphrase"}<div class="input-wrap">${icon("Shield")}<input type="password" name="password" required minlength="10" autocomplete="${configured ? "current-password" : "new-password"}" placeholder="At least 10 characters"></div></label>
        ${!configured ? `<label>Confirm passphrase<div class="input-wrap">${icon("Shield")}<input type="password" name="confirm" required minlength="10" autocomplete="new-password" placeholder="Enter it again"></div></label>` : ""}
        <div class="form-error hidden" id="login-error"></div>
        <button class="primary-button login-submit">${configured ? "Unlock workspace" : "Create local lock"} ${icon("Arrow")}</button>
        ${configured ? `<button type="button" class="text-button" data-action="reset-lock">Forgot the passphrase? Reset the local lock</button>` : ""}
        <div class="login-foot">${icon("Shield")} This is only a convenience lock. It does not encrypt your records or verify your identity.</div>
      </form></div>
    </div>`;
  }

  function workspaceView() {
    const nav = tabs.map((name) => `<div>${["Overview", "Inventory", "Accounting"].includes(name) ? `<div class="nav-group">${name === "Overview" ? "Workspace" : name === "Inventory" ? "Manage" : "Insights"}</div>` : ""}
      <button class="nav-item ${tab === name ? "active" : ""}" data-tab="${name}">${icon(name)}<span>${name}</span>${name === "Inventory" ? `<span class="nav-count">${active(data.items).length}</span>` : ""}</button></div>`).join("");
    const page = ({
      Overview: dashboardPage,
      Sales: () => transactionsPage("sale", "Sales & invoices"),
      Purchases: () => transactionsPage("purchase", "Purchases"),
      Expenses: () => transactionsPage("expense", "Expenses"),
      Inventory: inventoryPage,
      Ledgers: ledgersPage,
      Accounting: accountingPage,
      Reports: reportsPage,
      Tools: toolsPage,
      Settings: settingsPage
    })[tab]();
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    return `<div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-icon">${icon("Overview")}</span><div><b>Smart Tally Mobile</b><small>AZEES' PERSONAL EDITION</small></div><button class="icon-button sidebar-close" data-action="close-menu" aria-label="Close menu">×</button></div>
        <div class="company-switch"><span class="company-avatar">A</span><div><b>Azees' Business</b><small>Personal workspace · This device</small></div>${icon("Settings")}</div>
        <nav class="side-nav">${nav}</nav>
        <div class="sidebar-bottom"><div class="help-card"><div class="help-icon">${icon("Shield")}</div><b>Need a hand?</b><span>Keep a portable backup of your records.</span><button data-action="go-settings">Open data settings ${icon("Arrow")}</button></div>
          <div class="profile"><div class="profile-avatar">A</div><div class="profile-info"><b>Azees</b><span>Owner · Device-local</span></div><button class="icon-button" data-action="lock" title="Lock workspace">${icon("Shield")}</button></div>
        </div>
      </aside>
      <button class="mobile-overlay hidden" data-action="close-menu" aria-label="Close menu overlay"></button>
      <main class="main-area"><header class="topbar"><div class="topbar-left"><button class="icon-button menu-trigger" data-action="open-menu" aria-label="Open menu">${icon("Menu")}</button><div class="breadcrumbs"><span>Workspace</span><span class="crumb-slash">/</span><b>${tab}</b></div></div>
        <div class="topbar-actions"><div class="today-pill">${icon("Reports")}<span>${new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date())}</span></div>
          <button class="icon-button theme-button" data-action="theme" title="Switch theme">${icon(dark ? "Sun" : "Moon")}</button><button class="notification-button" data-tab="Reports" aria-label="Notifications">${icon("Bell")}<i></i></button><div class="top-avatar">A</div></div></header>
        <div class="content-area">${page}</div>
      </main>
      <nav class="mobile-nav">${["Overview", "Sales", "Purchases", "Inventory"].map((name) => `<button class="${tab === name ? "selected" : ""}" data-tab="${name}">${icon(name)}<span>${name}</span></button>`).join("")}<button data-action="open-menu">${icon("More")}<span>More</span></button></nav>
      ${modal ? modalView() : ""}
    </div>`;
  }

  function metric(title, value, change, tone, sub) {
    return `<div class="card metric-card"><div class="metric-top">${esc(title)}<span class="metric-icon ${tone}">${icon(tone === "green" ? "Sales" : tone === "blue" ? "Purchases" : tone === "gold" ? "Wallet" : "Chart")}</span></div><div class="metric-value">${value}</div><div class="metric-foot"><span>${esc(change)}</span></div><div class="metric-foot"><span>${esc(sub)}</span></div></div>`;
  }

  function dashboardStats() {
    const tx = active(data.transactions);
    const month = today().slice(0, 7);
    const total = (type, when) => tx.filter((row) => row.type === type && (!when || row.date?.startsWith(when))).reduce((sum, row) => sum + number(row.amount), 0);
    const cash = tx.reduce((sum, row) => sum + (row.payment_mode === "cash" ? (["sale", "collection"].includes(row.type) ? number(row.paid) : -number(row.paid)) : 0), 0);
    const bank = tx.reduce((sum, row) => sum + (row.payment_mode === "bank" ? (["sale", "collection"].includes(row.type) ? number(row.paid) : -number(row.paid)) : 0), 0);
    const recent = tx.slice().sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`)).slice(0, 8);
    const months = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(`${today()}T00:00:00Z`);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - offset);
      const key = date.toISOString().slice(0, 7);
      months.push({ key, sales: total("sale", key), purchases: total("purchase", key) });
    }
    return { tx, month, total, cash, bank, recent, months };
  }

  function dashboardPage() {
    const s = dashboardStats();
    const sales = s.total("sale");
    const purchases = s.total("purchase");
    const expenses = s.total("expense");
    const msales = s.total("sale", s.month);
    const mpurchases = s.total("purchase", s.month);
    const mexpenses = s.total("expense", s.month);
    const max = Math.max(...s.months.flatMap((row) => [row.sales, row.purchases]), 1);
    const trends = s.months.map((row) => `<div class="chart-group"><div class="bar-pair"><i class="bar-sales" style="height:${Math.max(6, row.sales / max * 100)}%"></i><i class="bar-purchase" style="height:${Math.max(6, row.purchases / max * 100)}%"></i></div><span>${new Date(`${row.key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short" })}</span></div>`).join("");
    const latest = s.recent.length ? `<div class="table-wrap"><table><thead><tr><th>REFERENCE</th><th>PARTY / DETAILS</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>${s.recent.map((row) => `<tr><td><b class="ref-code">${esc(row.number)}</b></td><td><b>${esc(row.party_name || row.category || "—")}</b><small class="table-secondary">${esc(row.description)}</small></td><td>${fmtDate(row.date)}</td><td class="amount-cell">${money(row.amount)}</td><td><span class="status-pill ${row.status === "paid" ? "status-paid" : "status-pending"}"><i></i>${esc(String(row.status).toUpperCase())}</span></td></tr>`).join("")}</tbody></table></div>` : empty("Your books are ready", "Add your first sale, purchase or expense to see activity here.", button("Create first invoice", "new-sale"));
    return `${heading("AZEES' PERSONAL BUSINESS OVERVIEW", "Welcome Azees", "Here’s what’s happening with your business today.", button("New invoice", "new-sale"))}
      <div class="quick-actions"><button data-action="new-sale"><span class="quick-icon q-green">${icon("Add")}</span><span><b>Create invoice</b><small>Record a new sale</small></span>${icon("Arrow")}</button><button data-action="new-purchase"><span class="quick-icon q-blue">${icon("Purchases")}</span><span><b>Record purchase</b><small>Log supplier invoice</small></span>${icon("Arrow")}</button><button data-action="new-expense"><span class="quick-icon q-orange">${icon("Expenses")}</span><span><b>Add an expense</b><small>Track where it goes</small></span>${icon("Arrow")}</button></div>
      <div class="metric-grid">${metric("Today's sales", money(s.total("sale", today())), `${money(msales)} this month`, "green", "Revenue received today")}${metric("Today's purchases", money(s.total("purchase", today())), `${money(mpurchases)} this month`, "blue", "Supplier bills recorded")}${metric("Cash balance", money(s.cash), "Across all transactions", "gold", "Available cash on hand")}${metric("Bank balance", money(s.bank), "Across all accounts", "purple", "Available bank balance")}</div>
      <div class="dashboard-main-grid">${card(`${sectionHead("Revenue overview", "Monthly sales & purchases · INR", `<button class="select-chip" data-tab="Reports">Last 6 months ${icon("Settings")}</button>`)}<div class="chart-summary"><div><span>Total revenue</span><b>${money(msales)}</b></div><div class="chart-legend"><span><i class="legend-sales"></i>Sales</span><span><i class="legend-purchases"></i>Purchases</span></div></div>${s.tx.length ? `<div class="chart"><div class="chart-y"><span>${money(max)}</span><span>${money(max / 2)}</span><span>₹0</span></div><div class="chart-plot"><div class="chart-gridlines"><i></i><i></i><i></i></div><div class="chart-bars">${trends}</div></div></div>` : empty("Your revenue chart is waiting", "Add a few sales to see your monthly trends.")}`, "revenue-card")}${card(`${sectionHead("Profit & loss", "This month so far")}<div class="profit-amount">${money(msales - mpurchases - mexpenses)}<span class="profit-tag">${icon("Chart")} Net profit</span></div><div class="profit-lines"><div><span>Revenue</span><b>${money(msales)}</b></div><div><span>Purchases</span><b>${money(mpurchases)}</b></div><div><span>Expenses</span><b>${money(mexpenses)}</b></div></div><button class="text-button" data-tab="Accounting">View accounting ${icon("Arrow")}</button>`, "insights-card")}</div>
      ${card(`${sectionHead("Recent transactions", "The latest activity in your books", `<button class="text-button" data-tab="Sales">View sales ${icon("Arrow")}</button>`)}${latest}`, "recent-card")}
      ${card(`${sectionHead("Workspace at a glance", "Current records")}<div class="profit-lines"><div><span>Pending invoices & bills</span><b>${money(s.tx.filter((row) => ["sale", "purchase"].includes(row.type)).reduce((sum, row) => sum + Math.max(0, number(row.amount) - number(row.paid)), 0))}</b></div><div><span>Low stock items</span><b>${active(data.items).filter((row) => number(row.quantity) <= number(row.low_stock)).length}</b></div></div>`, "stock-alert")}`;
  }

  function searchBox(placeholder) {
    return `<div class="search-box">${icon("Search")}<input data-search value="${esc(search)}" placeholder="${esc(placeholder)}"><button class="${search ? "" : "hidden"}" data-action="clear-search">${icon("Close")}</button></div>`;
  }

  function table(headers, body) {
    return `<div class="table-wrap"><table><thead><tr>${headers.map((head) => `<th>${esc(head)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function transactionsPage(type, title) {
    const rows = active(data.transactions).filter((row) => row.type === type).sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`));
    const filtered = rows.filter((row) => `${row.party_name} ${row.number} ${row.category} ${row.description}`.toLowerCase().includes(search.toLowerCase()));
    const total = rows.reduce((sum, row) => sum + number(row.amount), 0);
    const paid = rows.reduce((sum, row) => sum + number(row.paid), 0);
    const outstanding = rows.reduce((sum, row) => sum + Math.max(0, number(row.amount) - number(row.paid)), 0);
    const action = type === "sale" ? "new-sale" : type === "purchase" ? "new-purchase" : "new-expense";
    const label = type === "sale" ? "New invoice" : type === "purchase" ? "Record purchase" : "Add expense";
    const body = filtered.map((row) => `<tr><td><b class="ref-code">${esc(row.number)}</b></td><td><b>${esc(row.party_name || row.category || "—")}</b><small class="table-secondary">${esc(row.description)}</small></td><td>${fmtDate(row.date)}</td><td>${money(row.subtotal)}</td><td>${money(row.tax)}</td><td class="amount-cell">${money(row.amount)}</td><td><span class="status-pill ${row.status === "paid" ? "status-paid" : "status-pending"}"><i></i>${esc(String(row.status).toUpperCase())}</span></td><td><button class="icon-button row-action" data-action="print" data-id="${row.id}" title="Print invoice">${icon("File")}</button>${type === "sale" ? `<button class="icon-button row-action" data-action="share" data-id="${row.id}" title="Share">${icon("Arrow")}</button>` : ""}${["sale", "purchase"].includes(type) && row.status !== "paid" ? `<button class="icon-button row-action" data-action="payment" data-id="${row.id}" title="Record payment">${icon("Wallet")}</button>` : ""}<button class="icon-button row-action" data-action="edit-transaction" data-id="${row.id}" title="Edit">${icon("Settings")}</button>${["sale", "purchase"].includes(type) ? `<button class="icon-button row-action" data-action="duplicate" data-id="${row.id}" title="Duplicate">${icon("Add")}</button><button class="icon-button row-action" data-action="reset-payment" data-id="${row.id}" title="Reset payments">${icon("Close")}</button>` : ""}<button class="icon-button row-action" data-action="delete-transaction" data-id="${row.id}" title="Move to Recycle Bin">${icon("Close")}</button></td></tr>`).join("");
    const listing = filtered.length ? table(["REFERENCE", "PARTY / DETAILS", "DATE", "SUBTOTAL", "GST", "TOTAL", "STATUS", "ACTIONS"], body) : empty(search ? "No matching transactions" : `No ${type} recorded yet`, search ? "Try another search term." : "Once you add a transaction, it will show up here.", search ? "" : button(label, action));
    const subtitle = type === "sale" ? "Create GST invoices and keep customer payments in view." : type === "purchase" ? "Keep supplier bills, costs and outstanding payments organized." : "Track every business expense in one tidy place.";
    return `${heading(`WORKSPACE / ${type.toUpperCase()}`, title, subtitle, button(label, action))}
      <div class="summary-strip">${card(`<span>${type === "sale" ? "Total sales" : type === "purchase" ? "Total purchases" : "Total expenses"}</span><b>${money(total)}</b><small>All recorded transactions</small>`)}${card(`<span>${type === "sale" ? "Collected" : "Payments recorded"}</span><b>${money(paid)}</b><small>Payments recorded</small>`)}${card(`<span>Outstanding</span><b class="${outstanding ? "outstanding-color" : ""}">${money(outstanding)}</b><small>Awaiting settlement</small>`)}</div>
      ${card(`${sectionHead("All transactions", `${rows.length} records in your books`, `<button class="secondary-button" data-action="export-transactions" data-type="${type}">${icon("Download")}Export CSV</button>`)}<div class="list-controls">${searchBox(`Search ${type}...`)}<span class="filter-button secondary-button">All records</span></div>${listing}`, "listing-card")}`;
  }

  function ledgersPage() {
    const rows = active(data.ledgers).filter((row) => `${row.name} ${row.phone} ${row.gstin}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
    const body = rows.map((row) => `<tr><td><div class="ledger-cell"><span class="ledger-avatar l-${esc(row.type)}">${esc(row.name.slice(0, 1).toUpperCase())}</span><div><b>${esc(row.name)}</b><small>${esc(row.email || row.address || "—")}</small></div></div></td><td><span class="type-label type-${esc(row.type)}">${esc(row.type.toUpperCase())}</span></td><td>${esc(row.phone || "—")}</td><td>${esc(row.gstin || "—")}</td><td class="amount-cell">${money(row.opening_balance)} <small>${esc(row.balance_type)}</small></td><td><button class="icon-button row-action" data-action="edit-ledger" data-id="${row.id}" title="Edit ledger">${icon("Settings")}</button><button class="icon-button row-action" data-action="delete-ledger" data-id="${row.id}" title="Delete ledger">${icon("Close")}</button></td></tr>`).join("");
    const customers = rows.filter((row) => row.type === "customer").length;
    const suppliers = rows.filter((row) => row.type === "vendor").length;
    return `${heading("WORKSPACE / RELATIONSHIPS", "Your ledgers", "Customers, suppliers and accounts — all in one place.", button("Add ledger", "new-ledger"))}
      <div class="summary-strip">${card(`<span>Total ledgers</span><b>${rows.length}</b><small>Accounts in your workspace</small>`)}${card(`<span>Customers</span><b>${customers}</b><small>Customer accounts</small>`)}${card(`<span>Suppliers</span><b>${suppliers}</b><small>Vendor accounts</small>`)}</div>
      ${card(`${sectionHead("All ledgers", "Search and manage your account relationships")}<div class="list-controls">${searchBox("Search by name, phone or GSTIN...")}</div>${rows.length ? table(["NAME", "TYPE", "PHONE", "GSTIN", "OPENING BALANCE", ""], body) : empty("Start with a ledger", "Add a customer or supplier to keep every transaction connected.", button("Add your first ledger", "new-ledger"))}`, "listing-card")}`;
  }

  function inventoryPage() {
    const rows = active(data.items).filter((row) => `${row.name} ${row.sku} ${row.category} ${row.barcode}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
    const value = rows.reduce((sum, row) => sum + number(row.quantity) * number(row.purchase_price), 0);
    const low = rows.filter((row) => number(row.quantity) <= number(row.low_stock)).length;
    const body = rows.map((row) => {
      const isLow = number(row.quantity) <= number(row.low_stock);
      return `<tr><td><div class="ledger-cell"><span class="item-avatar">${icon("Package")}</span><div><b>${esc(row.name)}</b><small>${esc(row.unit)}</small></div></div></td><td><b class="ref-code">${esc(row.sku || "—")}</b><small class="table-secondary">${esc(row.barcode)}</small></td><td>${esc(row.category || "—")}</td><td><span class="stock-level ${isLow ? "stock-low" : ""}">${number(row.quantity)} ${esc(row.unit)}</span>${isLow ? `<small class="low-label">Low stock</small>` : ""}</td><td>${money(row.purchase_price)}</td><td>${money(row.selling_price)}</td><td class="amount-cell">${money(number(row.quantity) * number(row.purchase_price))}</td><td><button class="icon-button row-action" data-action="stock-in" data-id="${row.id}" title="Stock in">${icon("Add")}</button><button class="icon-button row-action" data-action="stock-out" data-id="${row.id}" title="Stock out">${icon("Purchases")}</button><button class="icon-button row-action" data-action="stock-adjust" data-id="${row.id}" title="Set stock">${icon("Settings")}</button><button class="icon-button row-action" data-action="edit-item" data-id="${row.id}" title="Edit item">${icon("File")}</button><button class="icon-button row-action" data-action="reset-stock" data-id="${row.id}" title="Reset stock">${icon("Close")}</button><button class="icon-button row-action" data-action="delete-item" data-id="${row.id}" title="Move to Recycle Bin">${icon("Close")}</button></td></tr>`;
    }).join("");
    return `${heading("WORKSPACE / CATALOG", "Inventory", "Keep an eye on stock levels, costs and product performance.", button("Add item", "new-item"))}
      <div class="summary-strip">${card(`<span>Products</span><b>${rows.length}</b><small>Items in your catalog</small>`)}${card(`<span>Stock value</span><b>${money(value)}</b><small>At purchase price</small>`)}${card(`<span>Low stock alerts</span><b class="${low ? "outstanding-color" : ""}">${low}</b><small>Items at or below minimum</small>`)}</div>
      ${card(`${sectionHead("Item master", "Product list with live stock levels")}<div class="list-controls">${searchBox("Search item, SKU or barcode...")}</div>${rows.length ? table(["ITEM", "SKU / BARCODE", "CATEGORY", "IN STOCK", "BUY PRICE", "SELL PRICE", "STOCK VALUE", "ACTIONS"], body) : empty("Your catalog starts here", "Add the products you sell and track stock as it moves.", button("Add your first item", "new-item"))}`, "listing-card")}`;
  }

  function reportTotals(from = `${today().slice(0, 7)}-01`, to = today()) {
    const rows = active(data.transactions).filter((row) => row.date >= from && row.date <= to);
    return {
      rows,
      revenue: rows.filter((row) => row.type === "sale").reduce((sum, row) => sum + number(row.amount), 0),
      purchases: rows.filter((row) => row.type === "purchase").reduce((sum, row) => sum + number(row.amount), 0),
      expenses: rows.filter((row) => row.type === "expense").reduce((sum, row) => sum + number(row.amount), 0)
    };
  }

  function balanceTotals() {
    const rows = active(data.transactions);
    const cash = rows.filter((row) => row.payment_mode === "cash").reduce((sum, row) => sum + (["sale", "collection"].includes(row.type) ? number(row.paid) : -number(row.paid)), 0);
    const bank = rows.filter((row) => row.payment_mode === "bank").reduce((sum, row) => sum + (["sale", "collection"].includes(row.type) ? number(row.paid) : -number(row.paid)), 0);
    return {
      cash, bank,
      inventory: active(data.items).reduce((sum, row) => sum + number(row.quantity) * number(row.purchase_price), 0),
      receivables: rows.filter((row) => row.type === "sale").reduce((sum, row) => sum + number(row.amount) - number(row.paid), 0),
      payables: rows.filter((row) => row.type === "purchase").reduce((sum, row) => sum + number(row.amount) - number(row.paid), 0)
    };
  }

  function trialBalance() {
    return active(data.ledgers).map((ledger) => {
      const activity = active(data.transactions).filter((row) => Number(row.party_id) === Number(ledger.id))
        .reduce((sum, row) => sum + (["sale", "collection"].includes(row.type) ? number(row.amount) : -number(row.amount)), 0);
      return { ...ledger, activity, balance: number(ledger.opening_balance) + activity };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  function accountingPage() {
    const pl = reportTotals();
    const balance = balanceTotals();
    const profit = pl.revenue - pl.purchases - pl.expenses;
    const trial = trialBalance();
    const books = [["Day book", "Daily transactions and entries"], ["Cash book", "Cash receipts and payments"], ["Bank book", "Bank movement summary"], ["Profit & loss", "Income and expense statement"], ["Balance sheet", "Snapshot of assets and liabilities"]];
    return `${heading("INSIGHTS / BOOKS", "Accounting", "A clear view of your books, balances and business health.")}
      <div class="quick-actions"><button data-action="new-collection"><span class="quick-icon q-green">${icon("Sales")}</span><span><b>New receipt</b><small>Record customer collection</small></span>${icon("Arrow")}</button><button data-action="new-payment"><span class="quick-icon q-blue">${icon("Purchases")}</span><span><b>New payment</b><small>Record supplier payment</small></span>${icon("Arrow")}</button></div>
      <div class="accounting-hero"><div><div class="eyebrow">PROFIT & LOSS · THIS MONTH</div><h2>${money(profit)}</h2><span>Net profit / (loss)</span></div><div class="accounting-hero-icon">${icon("Accounting")}</div></div>
      <div class="metric-grid accounting-metrics">${metric("Revenue", money(pl.revenue), "Sales invoices", "green", "This period")}${metric("Purchases", money(pl.purchases), "Supplier bills", "blue", "This period")}${metric("Operating expenses", money(pl.expenses), "Recorded expenses", "orange", "This period")}${metric("Net margin", `${pl.revenue ? (profit / pl.revenue * 100).toFixed(1) : "0.0"}%`, "Profit as % of revenue", "purple", "This period")}</div>
      <div class="accounting-grid">${card(`${sectionHead("Balance sheet snapshot", "Assets, receivables & payables")}<div class="balance-list">${[["Cash on hand", balance.cash], ["Bank accounts", balance.bank], ["Inventory value", balance.inventory], ["Customer receivables", balance.receivables], ["Vendor payables", balance.payables]].map(([name, value]) => `<div><span>${name}</span><b>${money(value)}</b></div>`).join("")}</div>`)}${card(`${sectionHead("Accounting books", "Reports built from recorded transactions")}<div class="book-links">${books.map(([name, desc]) => `<button data-action="book-info" data-name="${esc(name)}"><span class="book-link-icon">${icon("Reports")}</span><span><b>${name}</b><small>${desc}</small></span>${icon("Arrow")}</button>`).join("")}</div>`)}</div>
      ${card(`${sectionHead("Trial balance", "Ledger balances for a quick account check")}${trial.length ? table(["ACCOUNT", "TYPE", "OPENING", "ACTIVITY", "CURRENT BALANCE"], trial.map((row) => `<tr><td><b>${esc(row.name)}</b></td><td><span class="type-label">${esc(row.type.toUpperCase())}</span></td><td>${money(row.opening_balance)}</td><td>${money(row.activity)}</td><td class="amount-cell">${money(row.balance)}</td></tr>`).join("")) : empty("No ledgers to balance", "Add a ledger to see its trial balance.")}`, "listing-card")}`;
  }

  function reportsPage() {
    const pl = reportTotals();
    const monthly = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(`${today()}T00:00:00Z`);
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - offset);
      const key = date.toISOString().slice(0, 7);
      const result = reportTotals(`${key}-01`, `${key}-31`);
      monthly.push({ key, ...result });
    }
    const body = active(data.transactions).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100)
      .map((row) => `<tr><td>${fmtDate(row.date)}</td><td><b>${esc(row.number)}</b></td><td>${esc(row.type)}</td><td>${esc(row.party_name || row.category || "—")}</td><td class="amount-cell">${money(row.amount)}</td></tr>`).join("");
    return `${heading("INSIGHTS / REPORTS", "Business reports", "Monthly summaries and transaction details for your records.", `<button class="secondary-button" data-action="export-all-csv">${icon("Download")}Export CSV</button>`)}
      <div class="summary-strip">${card(`<span>Revenue this month</span><b>${money(pl.revenue)}</b><small>Sales invoices</small>`)}${card(`<span>Purchases this month</span><b>${money(pl.purchases)}</b><small>Supplier bills</small>`)}${card(`<span>Expenses this month</span><b>${money(pl.expenses)}</b><small>Recorded expenses</small>`)}</div>
      ${card(`${sectionHead("Monthly summary", "Sales, purchases and expenses · INR")}<div class="table-wrap"><table><thead><tr><th>MONTH</th><th>SALES</th><th>PURCHASES</th><th>EXPENSES</th><th>NET</th></tr></thead><tbody>${monthly.map((row) => `<tr><td>${new Date(`${row.key}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td><td>${money(row.revenue)}</td><td>${money(row.purchases)}</td><td>${money(row.expenses)}</td><td class="amount-cell">${money(row.revenue - row.purchases - row.expenses)}</td></tr>`).join("")}</tbody></table></div>`, "listing-card")}
      ${card(`${sectionHead("Transaction report", "Latest 100 transactions", `<button class="secondary-button" data-action="export-all-csv">${icon("Download")}Export CSV</button>`)}${body ? table(["DATE", "REFERENCE", "TYPE", "PARTY / CATEGORY", "AMOUNT"], body) : empty("No report data yet", "Transactions will appear in reports when you add them.")}`, "listing-card")}`;
  }

  function toolsPage() {
    const notes = data.notes.slice().sort((a, b) => b.id - a.id);
    return `${heading("WORKSPACE / UTILITIES", "Tools", "Handy calculators and notes for your day-to-day work.")}
      <div class="tools-grid">${card(`${sectionHead("GST calculator", "Estimate tax on an amount")}<form id="gst-form" class="tool-form"><label>Amount before GST<input type="number" name="amount" min="0" step="0.01" value="1000" required></label><label>GST rate<select name="rate"><option>5</option><option>12</option><option selected>18</option><option>28</option></select></label><button class="primary-button">Calculate GST</button><p class="tool-result" id="gst-result">GST: ₹180 · Total: ₹1,180</p></form>`, "tool-card")}
      ${card(`${sectionHead("EMI calculator", "Estimate monthly loan payments")}<form id="emi-form" class="tool-form"><label>Loan amount<input type="number" name="principal" min="0" step="1" value="100000" required></label><label>Annual interest rate (%)<input type="number" name="rate" min="0" step="0.01" value="10" required></label><label>Term (months)<input type="number" name="months" min="1" step="1" value="12" required></label><button class="primary-button">Calculate EMI</button><p class="tool-result" id="emi-result">Monthly EMI: ₹8,792</p></form>`, "tool-card")}</div>
      ${card(`${sectionHead("Notes & reminders", "Personal notes saved in this browser", button("Add note", "new-note"))}${notes.length ? `<div class="notes-list">${notes.map((note) => `<article class="note-card"><div><b>${esc(note.title)}</b><small>${esc(note.reminder_at ? `Reminder: ${note.reminder_at}` : fmtDate(note.created_at?.slice(0, 10)))}</small></div><p>${esc(note.body)}</p><button class="icon-button row-action" data-action="delete-note" data-id="${note.id}" title="Delete note">${icon("Close")}</button></article>`).join("")}</div>` : empty("No notes yet", "Create a note or reminder to keep a detail close at hand.", button("Add a note", "new-note"))}`, "listing-card")}`;
  }

  function settingsPage() {
    const trash = recycleBin();
    const events = data.audit_logs.slice(0, 12);
    const binRows = trash.map((row) => `<tr><td><b>${esc(row.label)}</b></td><td><span class="type-label">${esc(row.kind)}</span></td><td>${esc(row.detail || "—")}</td><td>${new Date(row.deleted_at).toLocaleString()}</td><td><button class="secondary-button" data-action="restore" data-kind="${row.kind}" data-id="${row.id}">Restore</button><button class="icon-button row-action" data-action="purge" data-kind="${row.kind}" data-id="${row.id}" title="Permanently delete">${icon("Close")}</button></td></tr>`).join("");
    const logRows = events.map((row) => `<tr><td><span class="type-label">${esc(row.action)}</span></td><td>${esc(row.entity)}</td><td>${esc(row.details || "—")}</td><td>${new Date(row.created_at).toLocaleString()}</td></tr>`).join("");
    return `${heading("WORKSPACE / PREFERENCES", "Settings", "Manage your workspace, data and local access.")}
      <div class="settings-grid">${card(`${sectionHead("Workspace", "Your personal business setup")}<div class="settings-profile"><span class="settings-avatar">A</span><span><b>Azees' Business</b><small>Owner workspace · INR (₹)</small></span></div><div class="settings-row"><span><b>Workspace location</b><small>Your records are stored in this browser on this device.</small></span><span class="settings-value">Device-local</span></div><div class="settings-row"><span><b>Workspace lock</b><small>A convenience prompt only; it does not encrypt the records.</small></span><span class="status-pill status-paid"><i></i>LOCAL</span></div><div class="settings-row"><span><b>Activity log</b><small>${data.audit_logs.length} recent workspace events.</small></span><span class="settings-value">Active</span></div>`)}
      ${card(`${sectionHead("Data & backups", "Keep a safe copy of your business records")}<div class="backup-callout"><span>${icon("Shield")}</span><div><b>Your data stays in this browser</b><small>Export JSON regularly. Use that file to move records to another browser or device.</small></div></div><button class="backup-button" data-action="backup"><span>${icon("Download")}</span><span><b>Download portable backup</b><small>JSON export of your business data</small></span>${icon("Arrow")}</button><label class="backup-button file-backup"><span>${icon("File")}</span><span><b>Restore from JSON</b><small>Replaces current records after confirmation</small></span>${icon("Arrow")}<input type="file" accept="application/json,.json" data-action="restore-file"></label><button class="backup-button signout-row" data-action="lock"><span>${icon("Shield")}</span><span><b>Lock workspace</b><small>End this local session</small></span>${icon("Arrow")}</button>`)}</div>
      ${card(`${sectionHead("Safe data reset", "A portable JSON backup is downloaded before resetting data.")}<div class="reset-controls"><label>Reset scope<select id="reset-scope"><option value="today">Today's transactions</option><option value="month">This month's transactions</option><option value="year">This year's transactions</option><option value="module">Specific module</option><option value="full">Full business reset</option></select></label><label id="reset-module-label" class="hidden">Module<select id="reset-module"><option value="transactions">All transactions</option><option value="sales">Sales</option><option value="purchases">Purchases</option><option value="expenses">Expenses</option><option value="customers">Customers</option><option value="suppliers">Suppliers</option><option value="ledgers">All ledgers</option><option value="items">Inventory items</option><option value="notes">Notes</option></select></label><button class="primary-button danger-button" data-action="reset">Reset selected data</button></div>`, "listing-card")}
      ${card(`${sectionHead("Recycle Bin", `${trash.length} recoverable records · automatically expire after 30 days`)}${trash.length ? table(["RECORD", "TYPE", "DETAILS", "DELETED", "ACTIONS"], binRows) : empty("Recycle Bin is empty", "Deleted invoices, ledgers and items appear here for 30 days.")}`, "listing-card")}
      ${card(`${sectionHead("Recent activity", "Recent changes in this browser")}${logRows ? table(["EVENT", "AREA", "DETAIL", "TIME"], logRows) : empty("Your activity log is ready", "Workspace changes will appear here.")}`, "listing-card")}`;
  }

  function recycleBin() {
    const cutoff = Date.now() - 30 * 86400000;
    return [
      ...data.transactions.filter((row) => row.deleted_at).map((row) => ({ kind: "invoice", id: row.id, label: row.number, detail: row.party_name, deleted_at: row.deleted_at, row })),
      ...data.ledgers.filter((row) => row.deleted_at).map((row) => ({ kind: row.type === "customer" ? "customer" : row.type === "vendor" ? "supplier" : "ledger", id: row.id, label: row.name, detail: row.phone, deleted_at: row.deleted_at, row })),
      ...data.items.filter((row) => row.deleted_at).map((row) => ({ kind: "item", id: row.id, label: row.name, detail: row.sku, deleted_at: row.deleted_at, row }))
    ].filter((row) => new Date(row.deleted_at).getTime() >= cutoff).sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  }

  function purgeExpiredRecords() {
    const cutoff = Date.now() - 30 * 86400000;
    let removed = 0;
    for (const collection of ["transactions", "ledgers", "items"]) {
      const retained = data[collection].filter((row) => {
        const expired = row.deleted_at && new Date(row.deleted_at).getTime() < cutoff;
        if (expired) removed += 1;
        return !expired;
      });
      data[collection] = retained;
    }
    if (removed) audit("permanent_delete_expired", "recycle-bin", `${removed} records purged after 30 days`);
    return removed > 0;
  }

  function modalView() {
    const initial = modal.initial || {};
    const type = modal.type;
    const ledgerOptions = active(data.ledgers).map((ledger) => `<option value="${ledger.id}" ${Number(initial.party_id) === Number(ledger.id) ? "selected" : ""}>${esc(ledger.name)} · ${esc(ledger.type)}</option>`).join("");
    const field = (label, name, value = "", options = {}) => `<label>${esc(label)}<input name="${esc(name)}" value="${esc(value)}" type="${options.type || "text"}" ${options.required ? "required" : ""} ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.step ? `step="${options.step}"` : ""} ${options.maxLength ? `maxlength="${options.maxLength}"` : ""}></label>`;
    const select = (label, name, choices, selected) => `<label>${esc(label)}<select name="${esc(name)}">${choices.map(([value, text]) => `<option value="${esc(value)}" ${value === String(selected) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
    let title = "";
    let fields = "";
    if (type === "ledger") {
      title = initial.id ? "Edit ledger" : "Add a ledger";
      fields = `<div class="modal-grid">${field("Name", "name", initial.name, { required: true, maxLength: 120 })}${select("Account type", "type", [["customer", "Customer"], ["vendor", "Supplier"], ["bank", "Bank"], ["cash", "Cash"], ["other", "Other"]], initial.type || "customer")}${field("Phone", "phone", initial.phone, { maxLength: 40 })}${field("Email", "email", initial.email, { type: "email", maxLength: 150 })}${field("GSTIN", "gstin", initial.gstin, { maxLength: 20 })}${field("Opening balance", "opening_balance", initial.opening_balance || 0, { type: "number", min: 0, step: "0.01" })}${select("Balance type", "balance_type", [["receivable", "Receivable"], ["payable", "Payable"]], initial.balance_type || "receivable")}<label class="span-two">Address<textarea name="address" maxlength="500">${esc(initial.address || "")}</textarea></label></div>`;
    } else if (type === "item") {
      title = initial.id ? "Edit inventory item" : "Add inventory item";
      fields = `<div class="modal-grid">${field("Item name", "name", initial.name, { required: true, maxLength: 120 })}${field("SKU", "sku", initial.sku, { maxLength: 80 })}${field("Category", "category", initial.category, { maxLength: 80 })}${field("Barcode", "barcode", initial.barcode, { maxLength: 80 })}${field("Quantity", "quantity", initial.quantity ?? 0, { type: "number", min: 0, step: "0.01" })}${field("Low stock alert", "low_stock", initial.low_stock ?? 5, { type: "number", min: 0, step: "0.01" })}${field("Unit", "unit", initial.unit || "pcs", { maxLength: 20 })}${field("Purchase price", "purchase_price", initial.purchase_price ?? 0, { type: "number", min: 0, step: "0.01" })}${field("Selling price", "selling_price", initial.selling_price ?? 0, { type: "number", min: 0, step: "0.01" })}</div>`;
    } else if (type === "note") {
      title = "Add a note";
      fields = `<div class="modal-grid">${field("Title", "title", "", { required: true, maxLength: 120 })}<label>Reminder date<input name="reminder_at" type="date"></label><label class="span-two">Note<textarea name="body" maxlength="2000"></textarea></label></div>`;
    } else {
      const txType = type === "collection" ? "collection" : type === "payment" ? "payment" : type;
      title = initial.id ? "Edit transaction" : ({ sale: "Create sales invoice", purchase: "Record a purchase", expense: "Add an expense", collection: "Record a receipt", payment: "Record a payment" })[type];
      const partyLabel = type === "sale" || type === "collection" ? "Customer" : "Supplier";
      const defaultSubtotal = initial.subtotal ?? initial.amount ?? "";
      const defaultTax = number(initial.subtotal) ? (number(initial.tax) / number(initial.subtotal) * 100) : 18;
      const paymentTypes = [["cash", "Cash"], ["bank", "Bank"], ["upi", "UPI"], ["credit", "Credit"]];
      fields = `<div class="modal-grid">${field("Date", "date", initial.date || today(), { type: "date", required: true })}${select("Payment mode", "payment_mode", paymentTypes, initial.payment_mode || "cash")}
        ${type === "expense" ? select("Category", "category", [["fuel", "Fuel"], ["salary", "Salary"], ["office", "Office"], ["travel", "Travel"], ["misc", "Miscellaneous"]], initial.category || "office") : ""}
        ${type !== "expense" ? `<label>${partyLabel}<select name="party_id"><option value="">${type === "sale" || type === "collection" ? "Walk-in customer" : "No ledger selected"}</option>${ledgerOptions}</select></label>${field("Party name", "party_name", initial.party_name || "")}` : ""}
        ${field("Description", "description", initial.description || "", { maxLength: 500 })}
        ${field("Subtotal / amount", "subtotal", defaultSubtotal, { type: "number", min: 0, step: "0.01", required: true })}
        ${type !== "expense" && type !== "collection" && type !== "payment" ? field("GST rate (%)", "tax_rate", defaultTax, { type: "number", min: 0, step: "0.01" }) : ""}
        ${type !== "expense" && type !== "collection" && type !== "payment" ? field("Paid now", "paid", initial.paid ?? 0, { type: "number", min: 0, step: "0.01" }) : ""}
        ${type === "expense" || type === "collection" || type === "payment" ? field("Amount", "amount", initial.amount || "", { type: "number", min: 0.01, step: "0.01", required: true }) : ""}
      </div><p class="form-hint">This browser stores your business records locally. Export a backup before changing devices.</p>`;
      modal.txType = txType;
    }
    return `<div class="modal-backdrop" data-action="backdrop"><section class="entry-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><div class="eyebrow">SMART TALLY · ${esc(type.toUpperCase())}</div><h2>${esc(title)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close">×</button></div><form id="entry-form" data-type="${esc(type)}" data-id="${esc(initial.id || "")}">${fields}<div class="modal-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancel</button><button class="primary-button">Save record</button></div></form></section></div>`;
  }

  function download(name, contents, type) {
    const url = URL.createObjectURL(new Blob([contents], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportCsv(rows, filename) {
    const columns = ["number", "type", "date", "party_name", "category", "description", "subtotal", "tax", "amount", "paid", "status", "payment_mode"];
    const text = [columns.join(","), ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(","))].join("\r\n");
    download(filename, `\uFEFF${text}`, "text/csv;charset=utf-8");
  }

  async function exportBackup() {
    try {
      const backup = { version: 1, exportedAt: new Date().toISOString(), data: {
        ledgers: data.ledgers, transactions: data.transactions, items: data.items,
        stock_movements: data.stock_movements, notes: data.notes
      } };
      download(`smart-tally-backup-${today()}.json`, JSON.stringify(backup, null, 2), "application/json");
      audit("backup_export", "backup");
      await saveData();
      notify("Portable backup downloaded");
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Portable backup could not be created.");
      return false;
    }
  }

  function csvTransactions(type) {
    const key = type === "sale" ? "sale" : type === "purchase" ? "purchase" : "expense";
    exportCsv(active(data.transactions).filter((row) => row.type === key), `${key}-transactions.csv`);
  }

  function invoicePrint(row) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      notify("Allow pop-ups to print this invoice.");
      return;
    }
    printWindow.document.write(`<!doctype html><html><head><title>Invoice ${esc(row.number)}</title><style>body{font:15px Arial,sans-serif;color:#24342c;margin:48px auto;max-width:760px;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #236f50;padding-bottom:20px}h1{font-size:26px;margin:0 0 8px;color:#236f50}p{color:#617168}table{width:100%;border-collapse:collapse;margin-top:34px}td{padding:15px 10px;border-bottom:1px solid #dce6df}td:last-child{text-align:right;font-weight:bold}.total{font-size:21px;font-weight:bold;text-align:right;margin-top:25px}@media print{body{margin:20px auto}}</style></head><body><header><div><h1>Smart Tally Mobile</h1><p>Tax invoice</p></div><div><b>${esc(row.number)}</b><p>${fmtDate(row.date)}</p></div></header><p><b>Bill to</b><br>${esc(row.party_name || "Walk-in customer")}</p><table><tr><td>${esc(row.description || "Business goods and services")}</td><td>Subtotal&nbsp; ${money(row.subtotal)}</td></tr><tr><td>GST</td><td>${money(row.tax)}</td></tr></table><div class="total">Total&nbsp; ${money(row.amount)}</div><p>Payment status: ${esc(row.status)}</p><script>window.onload=()=>{window.focus();window.print()}</script></body></html>`);
    printWindow.document.close();
  }

  async function hashPassword(password, salt) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" }, key, 256);
    return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function makeSalt() {
    return [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function submitLogin(form) {
    const values = new FormData(form);
    const error = document.getElementById("login-error");
    const email = String(values.get("email")).trim().toLowerCase();
    const password = String(values.get("password"));
    const fail = (message) => {
      error.textContent = message;
      error.classList.remove("hidden");
    };
    if (email !== OWNER_EMAIL) {
      fail("This workspace is configured for the owner email shown above.");
      return;
    }
    try {
      if (form.dataset.mode === "setup") {
        if (password.length < 10) return fail("Choose a passphrase with at least 10 characters.");
        if (password !== values.get("confirm")) return fail("The passphrases do not match.");
        const salt = makeSalt();
        const digest = await hashPassword(password, Uint8Array.from(salt.match(/.{2}/g), (part) => parseInt(part, 16)));
        localStorage.setItem("st_local_lock", JSON.stringify({ salt, digest }));
        audit("local_lock_created", "auth");
      } else {
        const saved = JSON.parse(localStorage.getItem("st_local_lock") || "null");
        const digest = await hashPassword(password, Uint8Array.from(saved.salt.match(/.{2}/g), (part) => parseInt(part, 16)));
        if (digest !== saved.digest) return fail("Incorrect passphrase.");
        audit("unlock", "auth");
      }
      sessionStorage.setItem("st_unlocked", "yes");
      await persist();
      render();
    } catch (exception) {
      fail(exception instanceof Error ? exception.message : "Unable to unlock this local workspace.");
    }
  }

  function softDelete(collection, row, label) {
    row.deleted_at = new Date().toISOString();
    audit("delete", collection, label);
  }

  function validateBackup(backup) {
    if (!backup || backup.version !== 1 || !backup.data || typeof backup.data !== "object") throw new Error("This is not a supported Smart Tally JSON backup.");
    const tables = ["ledgers", "transactions", "items", "stock_movements", "notes"];
    for (const table of tables) {
      if (backup.data[table] !== undefined && !Array.isArray(backup.data[table])) throw new Error(`Invalid backup: ${table} must be a list.`);
    }
    return Object.fromEntries(tables.map((table) => [table, backup.data[table] || []]));
  }

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const imported = validateBackup(JSON.parse(await file.text()));
      if (!window.confirm("Restore replaces all current ledgers, transactions, items and notes. Download a backup and continue?")) return;
      if (!(await exportBackup())) return;
      data = { ...blankData(), ...imported };
      audit("backup_restore", "backup", file.name);
      await saveData();
      render();
      notify("Backup restored on this device");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Backup restore failed.");
    }
  }

  async function submitEntry(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const type = form.dataset.type;
    const recordId = Number(form.dataset.id);
    const index = (rows) => rows.findIndex((row) => Number(row.id) === recordId);
    if (type === "ledger") {
      const row = { ...values, id: recordId || id(), opening_balance: number(values.opening_balance), created_at: new Date().toISOString() };
      if (!row.name.trim()) return showError("Ledger name is required.");
      const i = index(data.ledgers);
      if (i < 0) data.ledgers.push(row); else data.ledgers[i] = { ...data.ledgers[i], ...row };
      audit(recordId ? "update" : "create", "ledger", row.name);
    } else if (type === "item") {
      const row = { ...values, id: recordId || id(), quantity: number(values.quantity), low_stock: number(values.low_stock), purchase_price: number(values.purchase_price), selling_price: number(values.selling_price), created_at: new Date().toISOString() };
      if (!row.name.trim()) return showError("Item name is required.");
      const i = index(data.items);
      if (i < 0) data.items.push(row); else data.items[i] = { ...data.items[i], ...row };
      audit(recordId ? "update" : "create", "item", row.name);
    } else if (type === "note") {
      if (!String(values.title || "").trim()) return showError("Note title is required.");
      data.notes.push({ ...values, id: id(), done: 0, created_at: new Date().toISOString() });
      audit("create", "note", values.title);
    } else {
      const txType = type === "collection" || type === "payment" ? type : type;
      const subtotal = number(values.subtotal || values.amount);
      const tax = ["sale", "purchase"].includes(type) ? subtotal * number(values.tax_rate || 0) / 100 : 0;
      const amount = ["sale", "purchase"].includes(type) ? subtotal + tax : number(values.amount);
      const paid = ["sale", "purchase"].includes(type) ? number(values.paid) : amount;
      const selectedLedger = active(data.ledgers).find((row) => Number(row.id) === Number(values.party_id));
      const row = {
        id: recordId || id(), type: txType, number: recordId ? data.transactions.find((item) => Number(item.id) === recordId)?.number : nextNumber(txType),
        date: values.date || today(), party_id: values.party_id ? Number(values.party_id) : null,
        party_name: values.party_name?.trim() || selectedLedger?.name || "",
        category: values.category || "", description: values.description || "",
        subtotal, tax, amount, payment_mode: values.payment_mode || "cash", paid,
        status: status(amount, paid), created_at: new Date().toISOString()
      };
      if (amount <= 0) return showError("Enter an amount greater than zero.");
      if (paid > amount) return showError("Payments cannot exceed the transaction total.");
      if (!row.date) return showError("Choose a transaction date.");
      if (recordId) {
        const i = index(data.transactions);
        if (i < 0) return showError("Transaction not found.");
        data.transactions[i] = { ...data.transactions[i], ...row };
      } else data.transactions.push(row);
      audit(recordId ? "update" : "create", "transaction", `${row.number} ${row.type}`);
    }
    modal = null;
    await persist("Saved successfully");
  }

  function deleteById(collection, recordId, label) {
    const row = data[collection].find((item) => Number(item.id) === Number(recordId));
    if (!row) return showError("Record not found.");
    if (!window.confirm(`Move ${label} to the Recycle Bin? It can be restored for 30 days.`)) return;
    softDelete(collection, row, label);
    void persist("Moved to Recycle Bin");
  }

  function rowById(collection, recordId) {
    return data[collection].find((row) => Number(row.id) === Number(recordId));
  }

  async function handleClick(event) {
    const target = event.target.closest("[data-action], [data-tab]");
    if (!target) return;
    if (target.dataset.tab) {
      tab = target.dataset.tab;
      search = "";
      render();
      return;
    }
    const action = target.dataset.action;
    const recordId = Number(target.dataset.id);
    const transaction = rowById("transactions", recordId);
    const item = rowById("items", recordId);
    const ledger = rowById("ledgers", recordId);
    switch (action) {
      case "dismiss-error": target.closest(".toast")?.remove(); break;
      case "open-menu": document.querySelector(".sidebar")?.classList.add("sidebar-open"); document.querySelector(".mobile-overlay")?.classList.remove("hidden"); break;
      case "close-menu": document.querySelector(".sidebar")?.classList.remove("sidebar-open"); document.querySelector(".mobile-overlay")?.classList.add("hidden"); break;
      case "theme": dark = !dark; localStorage.setItem("st_theme", dark ? "dark" : "light"); render(); break;
      case "go-settings": tab = "Settings"; render(); break;
      case "lock": sessionStorage.removeItem("st_unlocked"); audit("lock", "auth"); await persist(); render(); break;
      case "reset-lock":
        if (window.confirm("Remove the local passphrase and create a new one? Your saved business records will remain in this browser.")) {
          localStorage.removeItem("st_local_lock");
          render();
        }
        break;
      case "clear-search": search = ""; render(); break;
      case "new-sale": modal = { type: "sale" }; render(); break;
      case "new-purchase": modal = { type: "purchase" }; render(); break;
      case "new-expense": modal = { type: "expense" }; render(); break;
      case "new-collection": modal = { type: "collection" }; render(); break;
      case "new-payment": modal = { type: "payment" }; render(); break;
      case "new-ledger": modal = { type: "ledger" }; render(); break;
      case "new-item": modal = { type: "item" }; render(); break;
      case "new-note": modal = { type: "note" }; render(); break;
      case "close-modal": modal = null; render(); break;
      case "edit-ledger": modal = { type: "ledger", initial: ledger }; render(); break;
      case "edit-item": modal = { type: "item", initial: item }; render(); break;
      case "edit-transaction": modal = { type: transaction?.type, initial: transaction }; render(); break;
      case "delete-ledger": if (ledger) deleteById("ledgers", recordId, ledger.name); break;
      case "delete-item": if (item) deleteById("items", recordId, item.name); break;
      case "delete-transaction": if (transaction) deleteById("transactions", recordId, transaction.number); break;
      case "duplicate":
        if (transaction && window.confirm(`Create a new unpaid copy of ${transaction.number}?`)) {
          const copy = { ...transaction, id: id(), number: nextNumber(transaction.type), date: today(), paid: 0, status: "unpaid", deleted_at: null, created_at: new Date().toISOString() };
          data.transactions.push(copy); audit("duplicate", "transaction", copy.number); await persist("Invoice duplicated");
        }
        break;
      case "reset-payment":
        if (transaction && window.confirm(`Reset all payments on ${transaction.number}?`)) {
          transaction.paid = 0; transaction.status = "unpaid"; audit("reset_payment", "transaction", transaction.number); await persist("Invoice payment reset");
        }
        break;
      case "payment":
        if (transaction) {
          const remaining = number(transaction.amount) - number(transaction.paid);
          const amount = Number(window.prompt(`Outstanding: ${money(remaining)}. Enter amount received:`, String(remaining)));
          if (Number.isFinite(amount) && amount > 0 && amount <= remaining) {
            transaction.paid += amount; transaction.status = status(transaction.amount, transaction.paid);
            audit("update_payment", "transaction", transaction.number); await persist("Payment recorded");
          } else if (Number.isFinite(amount)) notify(`Enter an amount from ₹0.01 to ${money(remaining)}.`);
        }
        break;
      case "print": if (transaction) invoicePrint(transaction); break;
      case "share":
        if (transaction) {
          const text = `Invoice ${transaction.number} from Smart Tally Mobile: ${money(transaction.amount)}. Date: ${fmtDate(transaction.date)}.`;
          if (navigator.share) navigator.share({ title: `Invoice ${transaction.number}`, text }).catch(() => {});
          else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        }
        break;
      case "export-transactions": csvTransactions(target.dataset.type); break;
      case "export-all-csv": exportCsv(active(data.transactions), "smart-tally-transactions.csv"); break;
      case "backup": await exportBackup(); break;
      case "restore":
        if (window.confirm(`Permanently restore ${target.dataset.kind}?`)) {
          const itemInBin = recycleBin().find((row) => row.kind === target.dataset.kind && Number(row.id) === recordId);
          if (itemInBin) { itemInBin.row.deleted_at = null; audit("restore", itemInBin.kind, itemInBin.label); await persist(`${itemInBin.label} restored`); }
        }
        break;
      case "purge":
        if (window.confirm("Permanently delete this record? This cannot be undone.")) {
          const itemInBin = recycleBin().find((row) => row.kind === target.dataset.kind && Number(row.id) === recordId);
          if (itemInBin) { data[itemInBin.kind === "invoice" ? "transactions" : itemInBin.kind === "item" ? "items" : "ledgers"] = data[itemInBin.kind === "invoice" ? "transactions" : itemInBin.kind === "item" ? "items" : "ledgers"].filter((row) => Number(row.id) !== recordId); audit("permanent_delete", itemInBin.kind, itemInBin.label); await persist("Record permanently deleted"); }
        }
        break;
      case "reset": await resetData(); break;
      case "stock-in":
      case "stock-out":
      case "stock-adjust":
        if (item) {
          const movement = action === "stock-in" ? "in" : action === "stock-out" ? "out" : "adjustment";
          const quantity = Number(window.prompt(`${movement === "in" ? "Add stock" : movement === "out" ? "Remove stock" : "Set stock level"} for ${item.name}:`, "1"));
          if (Number.isFinite(quantity) && quantity > 0) {
            const after = movement === "adjustment" ? quantity : number(item.quantity) + (movement === "in" ? quantity : -quantity);
            if (after < 0) return notify("Stock cannot be reduced below zero.");
            item.quantity = after;
            data.stock_movements.push({ id: id(), item_id: item.id, movement, quantity, note: "Inventory adjustment", date: today() });
            audit("stock_movement", "item", `${item.name} ${movement}: ${quantity}`); await persist("Stock updated");
          } else if (Number.isFinite(quantity)) notify("Enter a quantity greater than zero.");
        }
        break;
      case "reset-stock":
        if (item && window.confirm(`Reset stock for ${item.name} to zero?`)) {
          const oldQuantity = number(item.quantity);
          item.quantity = 0;
          data.stock_movements.push({ id: id(), item_id: item.id, movement: "adjustment", quantity: oldQuantity, note: "Stock reset", date: today() });
          audit("reset_stock", "item", item.name); await persist("Stock reset");
        }
        break;
      case "delete-note":
        data.notes = data.notes.filter((note) => Number(note.id) !== recordId);
        audit("delete", "note", "Note removed"); await persist("Note deleted"); break;
      case "book-info": notify(`${target.dataset.name} uses the current recorded transactions.`); break;
      case "backdrop": if (event.target === target) { modal = null; render(); } break;
    }
  }

  async function resetData() {
    const scope = document.getElementById("reset-scope")?.value || "today";
    const module = document.getElementById("reset-module")?.value || "";
    const label = scope === "module" ? `the ${module} module` : scope === "full" ? "all business records" : `transactions for ${scope}`;
    if (!window.confirm(`Reset ${label}? A JSON safety backup will be downloaded first. Deleted records are recoverable for 30 days.`)) return;
    if (scope === "full" && window.prompt("Type RESET to confirm a full business reset.") !== "RESET") return notify("Full reset cancelled");
    if (!(await exportBackup())) return;
    const now = new Date().toISOString();
    const start = scope === "today" ? today() : scope === "month" ? `${today().slice(0, 7)}-01` : scope === "year" ? `${today().slice(0, 4)}-01-01` : "";
    if (["today", "month", "year"].includes(scope)) {
      active(data.transactions).filter((row) => row.date >= start && row.date <= today()).forEach((row) => { row.deleted_at = now; });
    } else if (scope === "full") {
      ["transactions", "ledgers", "items"].forEach((key) => active(data[key]).forEach((row) => { row.deleted_at = now; }));
      data.notes = [];
    } else {
      const table = ["sales", "purchases", "expenses", "transactions"].includes(module) ? "transactions" :
        ["customers", "suppliers", "ledgers"].includes(module) ? "ledgers" : module === "items" ? "items" : "";
      if (table === "transactions") {
        const type = { sales: "sale", purchases: "purchase", expenses: "expense" }[module];
        active(data.transactions).filter((row) => !type || row.type === type).forEach((row) => { row.deleted_at = now; });
      } else if (table === "ledgers") {
        const type = module === "customers" ? "customer" : module === "suppliers" ? "vendor" : "";
        active(data.ledgers).filter((row) => !type || row.type === type).forEach((row) => { row.deleted_at = now; });
      } else if (table === "items") active(data.items).forEach((row) => { row.deleted_at = now; });
      else if (module === "notes") data.notes = [];
    }
    audit("reset", "workspace", label);
    await persist("Reset completed. Safety backup downloaded.");
  }

  function render() {
    if (!sessionStorage.getItem("st_unlocked")) {
      root.innerHTML = loginView();
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      return;
    }
    root.innerHTML = workspaceView();
  }

  root.addEventListener("click", (event) => { void handleClick(event); });
  root.addEventListener("input", (event) => {
    if (event.target.matches("[data-search]")) {
      search = event.target.value;
      const position = event.target.selectionStart;
      render();
      const input = root.querySelector("[data-search]");
      input?.focus();
      input?.setSelectionRange(position, position);
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-action='restore-file']")) void restoreBackup(event.target.files?.[0]);
    if (event.target.id === "reset-scope") document.getElementById("reset-module-label")?.classList.toggle("hidden", event.target.value !== "module");
  });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === "login-form") void submitLogin(form);
    else if (form.id === "entry-form") void submitEntry(form);
    else if (form.id === "gst-form") {
      const values = new FormData(form);
      const amount = number(values.get("amount"));
      const tax = amount * number(values.get("rate")) / 100;
      document.getElementById("gst-result").textContent = `GST: ${money(tax)} · Total: ${money(amount + tax)}`;
    } else if (form.id === "emi-form") {
      const values = new FormData(form);
      const principal = number(values.get("principal"));
      const monthlyRate = number(values.get("rate")) / 1200;
      const months = Math.max(1, number(values.get("months")));
      const payment = monthlyRate ? principal * monthlyRate * (1 + monthlyRate) ** months / ((1 + monthlyRate) ** months - 1) : principal / months;
      document.getElementById("emi-result").textContent = `Monthly EMI: ${money(payment)}`;
    }
  });

  window.addEventListener("storage", async (event) => {
    if (event.key === "st_local_lock") sessionStorage.removeItem("st_unlocked");
  });

  (async () => {
    try {
      db = await openDatabase();
      data = await loadData();
      const defaults = blankData();
      for (const key of Object.keys(defaults)) if (!Array.isArray(data[key])) data[key] = defaults[key];
      if (data.version !== 1) throw new Error("This browser database has an unsupported version.");
      const purged = purgeExpiredRecords();
      if (purged) await saveData();
      render();
      if ("serviceWorker" in navigator && location.protocol !== "file:") {
        navigator.serviceWorker.register("./sw.js").catch((error) => console.error("Offline app shell could not be registered.", error));
      }
    } catch (error) {
      root.innerHTML = `<main class="content-area"><div class="form-error">Smart Tally could not open its local database: ${esc(error instanceof Error ? error.message : "Unknown storage error")}. Check that browser storage is enabled and available.</div></main>`;
    }
  })();
})();
