# Smart Tally Mobile

A mobile-first, single-owner bookkeeping app implemented with plain HTML, CSS and JavaScript. It runs as a static site and does not need Node.js, a server, an API, or a database service.

## Open the app

The public application URL is:

**https://codenishan.github.io/azees-smart-tally/**

The GitHub Actions workflow publishes only the contents of `site/`, so source files, local databases and backup folders are not part of the deployed artifact. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Every push to `main` or `pages-static` deploys the site; the Actions tab shows the deployment and its URL.

For local testing, serve the `site/` directory with any static web server and open its `index.html` over `http://localhost`; browser storage and the offline app shell require a secure context (HTTPS or localhost).

## Data, privacy and sign-in

Business records are stored in IndexedDB in the current browser on the current device. They are not uploaded, shared between devices, or synchronized with GitHub. Clearing the browser's site data can permanently remove records. Download a portable JSON backup regularly from **Settings → Data & backups** and restore it on another browser/device when needed. Existing server-hosted records must first be exported as a Smart Tally JSON backup and then imported into this app.

The first visit asks you to create a local passphrase. It is a convenience lock for the current browser session—not server-side authentication, encryption, or identity verification. The records themselves are not encrypted. Anyone able to access the browser profile or its developer tools may be able to access them. Use a trusted, device-protected browser profile and keep backup files private.

The static app works offline after its first successful load. Offline changes remain on that device and will not sync anywhere. Printing invoices, sharing, and saving backups depend on browser/device support.

## Included workflows

- Overview dashboard with daily/monthly totals, cash and bank balances, revenue trends, recent transactions and pending balances.
- Customer, supplier and other ledgers with contact/GSTIN details, search, opening balances, edit and recycle-bin deletion.
- GST sales and purchase invoices, expenses, partial payments, invoice duplication/reset, CSV exports, print-to-PDF and invoice sharing.
- Cash/bank/UPI receipts and payments.
- Inventory catalog, stock-in/out/adjustments, stock reset, valuation and low-stock alerts.
- Accounting summaries, ledger trial-balance view, monthly reports and transaction exports.
- GST and EMI calculators, notes/reminders, dark/light mode, responsive navigation, portable JSON backup/restore, activity log and a 30-day recycle bin.

This remains a personal bookkeeping tool, not certified GST filing software or a replacement for accountant-reviewed double-entry accounting. Verify tax calculations and generated documents with a qualified accountant.
