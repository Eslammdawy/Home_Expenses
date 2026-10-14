# Home Budget Tracker

A modern, responsive household budget and expense tracker built with React 18, Vite, TypeScript, Tailwind CSS (Glassmorphism), Recharts v3, and TanStack Query. 

All financial data resides safely in your private **Google Sheet**, interfaced directly via a **Google Apps Script** Web App. There is **no intermediate backend** or complex Google Cloud OAuth setup required.

---

## 🚀 Features

- **Monthly Dashboard**:
  - Month navigation with previous/next selector.
  - Summary metrics: Total Income, Total Expenses, Net Savings, Savings Rate %.
  - Income vs Expenses monthly comparison bar chart.
  - 6-month historical cashflow trend chart.
  - Category spending breakdown donut chart.
  - Interactive categories table with customizable color/emoji indicators and budget progress bars (green `< 80%`, amber `80%–100%`, red `> 100%`).
  - Top 5 expenses of the month.
- **Transactions Management**:
  - Real-time search, filters (type, category, date range), and multi-column sorting.
  - Sticky live totals bar for all filtered rows.
  - Client-side pagination (25 rows per page) and responsive card list on mobile screens.
  - Modal form for creating and editing records with type-dependent category dropdowns.
  - Fast optimistic updates with automatic rollback on error.
  - Confirmation dialogs for deletion.
- **Category Control & Rename Migration**:
  - Add, edit, and delete categories with emoji picker and color customizer.
  - Category deletion protection: blocks deleting categories with active transactions.
  - Sequential client-side category rename: updates existing transactions one-by-one with a non-dismissible migration progress dialog.
  - Blocks changing type (Income/Expense) if transactions are attached.
- **Quick-Add Floating Action Button (FAB)**:
  - Mobile bottom-sheet / desktop dialog to log transactions in under 10 seconds.
  - Remembers last used category per transaction type in local storage.
  - Numeric keyboard focus and quick category chips.
- **Client-Side CSV Export**:
  - Exports the current month's transactions.
  - Includes UTF-8 BOM (`\uFEFF`) to preserve Arabic characters in Microsoft Excel.
- **Preferences & Localization**:
  - Free-text currency and locale configuration verified via `Intl`.
  - Automatic RTL layout flip for Arabic locales (`ar-*`).
  - Latin numerals forced (`numberingSystem: 'latn'`) for consistency.
  - System / Light / Dark theme switcher with persistence.

---

## 📊 Google Sheet Setup

1. Create a new Google Spreadsheet.
2. In the spreadsheet, create three tabs with the exact headers below in row 1:
   - **`Transactions`**:
     ```text
     id | date | type | category | description | amount | payment_method | notes | month | created_at
     ```
   - **`Categories`**:
     ```text
     name | type | monthly_budget | color | icon
     ```
   - **`Settings`**:
     ```text
     key | value
     ```
3. In the `Settings` tab, add default rows:
   ```text
   currency         | EGP
   locale           | en-US
   month_start_day  | 1
   ```

---

## ⚙️ Google Apps Script Deployment

1. In your Google Sheet, open **Extensions > Apps Script**.
2. Replace all code in `Code.gs` with the backend script provided in `Code (40).gs`.
3. In the script editor menu, select the function **`setup`** and click **Run** once. This verifies all sheets, initializes headers, and locks column formats.
4. Set your shared API token:
   - Go to **Project Settings** (gear icon on the left) > **Script properties**.
   - Click **Add script property**.
   - Property: `API_TOKEN`
   - Value: `<your-secure-random-token-here>`
5. Click **Deploy > New deployment**:
   - Select type: **Web app**
   - Description: `Production Web App`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` *(Crucial: allows the frontend to query your script without Google OAuth)*
6. Click **Deploy** and copy the generated **Web app URL** (must end with `/exec`).

> **Updating code later**: Whenever you modify Apps Script, choose **Deploy > Manage deployments > Edit > New version > Deploy**.

---

## 💻 Local Development

1. Create your local environment configuration:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your values:
   ```env
   VITE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   VITE_API_TOKEN=your-secure-random-token-here
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Verify your backend connection (read-only contract check):
   ```bash
   npm run check:api
   ```
5. Run unit tests:
   ```bash
   npm test
   ```
6. Start the development server:
   ```bash
   npm run dev
   ```

---

## 🌐 Production Deployment

### 1. Tencent EdgeOne Pages (Recommended)
This repository includes `edgeone.json` to configure single-page application (SPA) routing rewrites.
1. Connect your Git repository to **Tencent EdgeOne Pages**.
2. Set Build Settings:
   - **Framework Preset**: `Vite` (or `Custom`)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Node.js Version**: `18.x` or `20.x`
3. Add Environment Variables in EdgeOne project settings:
   - `VITE_SCRIPT_URL`: your Apps Script `/exec` URL
   - `VITE_API_TOKEN`: your shared secret token
4. Deploy the site.

### 2. Vercel / Netlify
1. Import repository into Vercel or Netlify.
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add environment variables `VITE_SCRIPT_URL` and `VITE_API_TOKEN`.

---

## 🔐 Security Note

Because this is a pure client-side SPA, `VITE_API_TOKEN` is bundled into client assets and sent in network requests. This provides light protection against automated scrapers. 

For high-security environments, deploy a lightweight serverless edge proxy (such as a Cloudflare Worker, Tencent EdgeOne Function, or Vercel Edge Function) in front of the Apps Script URL. Keep the token in server environment variables and only expose authenticated sessions to the frontend.
