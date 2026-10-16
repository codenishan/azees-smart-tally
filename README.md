# Smart Tally Mobile

A mobile-first, single-owner bookkeeping workspace built with React, TypeScript, Tailwind CSS, Express and SQLite. The server is the source of truth; the browser stores only a signed session token and the chosen color theme.

## Project structure

```text
azees-smart-tally/
├── public/                 # PWA manifest, install icons and offline app shell
├── server/
│   ├── db.ts             # SQLite schema, indexes and database connection
│   ├── index.ts           # Authenticated REST API, audit logging and backups
├── src/
│   ├── App.tsx            # Application shell, pages, forms and workflows
│   ├── main.tsx           # React entry point and service-worker registration
│   └── styles.css         # Responsive light/dark design system
├── .env.example
├── index.html
├── package.json
├── render.yaml             # Render API + persistent SQLite disk
├── railway.json            # Railway API build, start and health-check settings
├── vercel.json             # Vercel SPA hosting
└── vite.config.ts
```

## Requirements

- Node.js 20 or newer (22 LTS recommended) and npm.
- A modern browser. Camera scanning, push delivery, and OS-level PDF saving depend on browser/device support.

## Install and run (Windows PowerShell)

```powershell
npm.cmd install
Copy-Item .env.example .env
```

Edit `.env` before running the app:

- `AUTH_PASSWORD`: choose a unique password of at least 10 characters.
- `JWT_SECRET`: replace the example with a cryptographically random secret of at least 32 characters. For example, generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
- Keep `.env`, `data/`, and `backups/` private; they are excluded from Git.

Run the application:

```powershell
npm.cmd run dev
```

Open `http://localhost:5173` and sign in as `abdulazees3121@gmail.com` with the password from `.env`. The API listens on port 3001 and Vite proxies `/api` to it. Only the authorized email is accepted.

### Open it on another laptop on the same Wi-Fi

Keep `npm.cmd run dev` running on the computer hosting the app. On that computer, run `ipconfig` and note the IPv4 address under the active **Wireless LAN adapter Wi-Fi** (or Ethernet adapter if wired). From another laptop on the same network, open `http://<host-ipv4>:5173`, replacing the placeholder with that computer's actual local IPv4 address. Do not use the example address `192.168.1.25` unless `ipconfig` actually shows it, and do not use an internet "what is my IP" result. The browser connects to the host computer, which serves the app and its API; business data remains in the host computer's SQLite database.

If Windows Firewall prompts you, allow Node.js on **Private networks**. If the page does not load, check that both devices are on the same network, that the host is still running the app, and that the host's firewall permits inbound connections on port 5173. The host's local IP can change when its network changes, so check `ipconfig` again if the address stops working.

This local-network address does not work from unrelated networks or while the host computer is off. Access from anywhere requires deploying the app to an internet-accessible HTTPS host and using its public domain; the GitHub repository URL is only the source code, not the app. For installable PWA behavior on other devices, use that HTTPS deployment.

The application starts with an empty business database. No demo ledgers, costs, transactions or inventory are created automatically.

## Build and production start

```powershell
npm.cmd run build
npm.cmd start
```

Set the production environment variables in the hosting platform rather than committing them. `npm start` runs the compiled API; the Vite build is hosted independently on Vercel.

## Public deployment: GitHub + Vercel + Render or Railway

The repository contains a Render Blueprint (`render.yaml`), Vercel SPA configuration (`vercel.json`), and a GitHub Actions build workflow. Publish the project to a GitHub repository, then connect that repository to both hosting providers:

1. **GitHub:** Create or use a repository for the application source. Never store business records or credentials in GitHub; `.env`, `data/`, and `backups/` are excluded by `.gitignore`. From this project folder, initialize Git if needed, add the GitHub remote, and push the `main` branch:
   ```powershell
   git init -b main
   git add .
   git commit -m "Prepare Azees Smart Tally for deployment"
   git remote add origin https://github.com/<your-account>/<your-repository>.git
   git push -u origin main
   ```
   `.env`, `data/`, and `backups/` are ignored; check that they are not included in the commit.
2. **Render API:** In Render, choose **New → Blueprint** and select the repository. The Blueprint creates a free web service. During creation, set the prompted `AUTH_PASSWORD` to Azees' chosen secret and `CLIENT_ORIGIN` to the exact Vercel origin, for example `https://azees-tally.vercel.app` (no trailing slash). Render generates `JWT_SECRET`. Copy the API service URL, such as `https://azees-smart-tally-api.onrender.com`.
3. **Vercel frontend:** Import the same GitHub repository as a Vite project. The included `vercel.json` sets the build and SPA fallback. In Vercel project settings, set `VITE_API_URL` to the Render API origin (for example `https://azees-smart-tally-api.onrender.com`), without a trailing slash, and deploy. Set or update Render's `CLIENT_ORIGIN` to the deployed Vercel origin, then redeploy the API if prompted.
4. **Verify:** Open `https://<render-service>.onrender.com/api/health` and confirm `{"ok":true}`. Open the Vercel HTTPS URL, sign in as the authorized owner, and check that the dashboard loads. The hosted SQLite database starts empty. If you explicitly want to transfer records later, download a portable JSON backup from **Settings → Download portable backup** and restore it through **Settings → Restore from JSON**.
5. **Android install:** Open the Vercel HTTPS URL in Chrome on Android, sign in, open the browser menu, and tap **Install app** or **Add to Home screen**. The app shell can load offline after first visit; accounting reads/writes still need the API connection.

Choose the Vercel project slug `azees-tally` if you want the example address `https://azees-tally.vercel.app`. A Vercel custom project slug is subject to availability. HTTPS is provided automatically by the hosting platforms.

**Free-tier limitations and data-loss warning:** Render's free web service spins down after inactivity and can take time to wake on the next request, so it is not continuously available. Its filesystem is ephemeral: SQLite records and scheduled backups can disappear after a restart, redeploy or instance replacement. Treat this free deployment as a demo, not as the authoritative bookkeeping database; keep independent portable backups. For durable accounting records and an always-on service, use a paid host with persistent storage. The Render Blueprint stores only a secret prompt for `AUTH_PASSWORD`, never the actual password.

The API permits only the configured `CLIENT_ORIGIN` browser origin. `VITE_API_URL` is a public frontend build setting, not a secret. Keep `JWT_SECRET`, `AUTH_PASSWORD`, and backups private. If you change the Vercel URL, update Render's `CLIENT_ORIGIN` to match exactly.

### Railway API alternative

`railway.json` configures the API build, start command and health check. Create a Railway project from the GitHub repository and deploy the service. Attach a persistent volume mounted at `/app/data`, then set `DATABASE_PATH=/app/data/smart-tally.sqlite` and `BACKUP_PATH=/app/data/backups`. Set `AUTH_PASSWORD`, a random `JWT_SECRET` (at least 32 characters), `CLIENT_ORIGIN` (the exact Vercel origin), and `SESSION_TIMEOUT_MINUTES` in Railway's private variables. Copy the Railway HTTPS domain into Vercel's `VITE_API_URL`, redeploy both services, and verify `/api/health` and owner sign-in. Do not use an ephemeral filesystem for the SQLite database.

The service worker caches the application shell and static resources. Accounting mutations require a live API connection; offline writes are not queued or synchronized. PWA installation is available on browsers that support installable web apps.

## Database

SQLite is created automatically at `DATABASE_PATH` (defaults to `./data/smart-tally.sqlite`). Foreign keys and WAL mode are enabled.

| Table | Purpose |
| --- | --- |
| `ledgers` | Customer, vendor, bank, cash and other contacts/accounts |
| `transactions` | Sales, purchases, expenses, collections and payments, including GST totals and settlement status |
| `items` | SKU/barcode, category, quantity, unit, low-stock threshold and prices |
| `stock_movements` | Recorded stock in/out/adjustments |
| `notes` | Personal notes and reminder dates |
| `sessions` | Allowlisted signed-in sessions and inactivity expiry |
| `audit_logs` | Authentication and business-data activity |

## REST API

All `/api` endpoints other than login require `Authorization: Bearer <token>`. The server validates input with Zod and returns JSON errors with non-2xx status codes.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Allowlisted email/password login |
| `POST` | `/api/auth/logout` | End the active session |
| `GET` | `/api/auth/me` | Validate and refresh session activity |
| `GET` | `/api/dashboard` | Summary totals, trends, low stock and latest transactions |
| `GET, POST` | `/api/ledgers` | Search and create ledgers |
| `PUT, DELETE` | `/api/ledgers/:id` | Update or move ledger into recycle bin |
| `GET, POST` | `/api/transactions` | Query and create sale, purchase, expense, receipt and payment records |
| `PUT, DELETE` | `/api/transactions/:id` | Edit or move transaction into recycle bin |
| `POST` | `/api/transactions/:id/duplicate` | Create a new unpaid transaction copy |
| `POST` | `/api/transactions/:id/reset` | Reset invoice settlement to unpaid |
| `PATCH` | `/api/transactions/:id/payment` | Update partial or full invoice settlement |
| `GET, POST` | `/api/items` | List and create inventory items |
| `PUT, DELETE` | `/api/items/:id` | Update/delete item |
| `POST` | `/api/items/:id/stock` | Record stock in, out or set an adjustment |
| `POST` | `/api/items/:id/reset-stock` | Set stock to zero and record the adjustment |
| `GET` | `/api/recycle-bin` | List deleted business records for 30-day recovery |
| `POST, DELETE` | `/api/recycle-bin/:kind/:id/restore` | Restore a record or permanently delete it |
| `POST` | `/api/reset` | Backed-up today, month, year, module or full reset |
| `GET` | `/api/reports/profit-loss` | Period revenue, purchases and expenses |
| `GET` | `/api/reports/trial-balance` | Per-ledger opening balance and transaction activity |
| `GET` | `/api/reports/balance-sheet` | Cash, bank, inventory, receivable and payable snapshot |
| `GET` | `/api/audit` | Latest audit activity |
| `GET, POST, DELETE` | `/api/notes` | Notes and reminders |
| `GET` | `/api/backup` | SQLite database download |
| `GET, POST` | `/api/backup/json`, `/api/backup/restore` | Portable JSON export and restore |

The SQLite snapshot backup is also created once per day while the server is running, retained for up to 30 days, and saved under `./backups`.

## Included workflows

- Dashboard with today's and monthly totals, cash/bank position, P&L summary, sales trend, low-stock count, pending balances and recent activity.
- Customer/vendor/bank ledgers with GSTIN/contact details, search, edit/delete API support and opening balances.
- GST sales/purchase/expense entries with sequential invoice numbers, edit, duplicate, reset-payment, soft-delete, partial payments, printable invoices (use the browser's **Save as PDF** destination), and WhatsApp/native share links.
- Customer receipts and supplier payment vouchers with one-step entry and cash/bank/UPI tracking.
- Expense categories: fuel, salary, office, travel and miscellaneous.
- Inventory catalog with editable SKU/barcode fields, categories, low-stock alerts, stock-in/out, reset-stock and adjustment actions.
- A 30-day recycle bin for invoices, ledgers, customers, suppliers and items; restores and permanent deletes are audited. Reset operations first create and verify a SQLite backup.
- Ledger trial-balance view, P&L and balance-sheet snapshots, monthly summaries and CSV exports compatible with spreadsheet applications.
- GST and EMI calculators, notes, JSON/SQLite backup restore, audit trail, dark/light mode and responsive bottom navigation.

## Scope and operational notes

This is a personal single-owner bookkeeping app, not a certified GST filing product or a replacement for accountant-reviewed double-entry software. The current trial balance is a per-ledger activity summary, not a debit/credit double-entry trial balance; invoice printouts are basic and need business address/GST registration configuration before tax use. Validate GST rules and generated tax documents with a qualified accountant. CSV exports open in Excel; native multi-sheet `.xlsx` import/export is not included.

SQLite is **not encrypted at rest** in this version. Protect the database and backup directories with OS/volume encryption and restrictive file permissions. Passwords are checked using Node's scrypt and timing-safe comparison; JWT bearer sessions are inactivity-limited on the server and expire absolutely after seven days. Deploy behind HTTPS. This build supports one owner role only; it does not implement additional staff roles or permissions.

AI categorization/insights, voice entry, barcode camera scanning, push notifications, UPI reconciliation, cloud backup, multi-device sync, journal/contra vouchers, multi-sheet Excel import/export and multilingual UI are not active services in this build. Offline mode caches the app shell only; accounting data entry requires an internet connection to the API. There is no third-party AI connection or external data sync. A persistent HTTPS API deployment and Vercel frontend must be configured before the app has a public URL.
