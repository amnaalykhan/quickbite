# 🍽 QuickBite — Smart Restaurant Ordering System

Customers scan a QR code at their table → menu opens in their phone browser → order appears live on the counter dashboard. Works from **any network** — no WiFi restriction.

---

## ⬇️ Download & Install

Go to the [**Releases page**](https://github.com/amnaalykhan/quickbite/releases/latest) to download the installer for your platform:

| Platform | File | Notes |
|---|---|---|
| **Windows** | `QuickBite-Windows-Setup.exe` | Double-click to install, creates desktop shortcut |
| **macOS (M1/M2/M3)** | `QuickBite-macOS-arm64.dmg` | Drag to Applications. First launch: System Settings → Privacy & Security → Open Anyway |

---

## 🌐 How It Works

```
Customer (any network)          Restaurant PC
──────────────────              ─────────────
Scans QR code
      ↓
Opens menu in browser
(GitHub Pages — instant load)
      ↓
Places order
      ↓
POST → Render cloud server ───→ Socket.io pushes to dashboard
                                      ↓
                                Staff sees order live 🔔
                                      ↓
                                Start Preparing → Done ✓
```

---

## 📁 Project Structure

```
quickbite/
├── electron-app/        ← Windows/macOS desktop dashboard
│   ├── main.js          ← Electron entry point
│   ├── server.js        ← Local Express server (dev/offline)
│   ├── dashboard/
│   │   └── index.html   ← Counter dashboard UI
│   └── package.json
├── customer-menu/
│   └── index.html       ← Customer mobile menu (hosted on GitHub Pages)
├── server/              ← Cloud server (deployed to Render)
│   ├── server.js        ← Express + Socket.io + PostgreSQL
│   └── package.json
└── render.yaml          ← Render deployment config
```

---

## 🚀 Running Locally (Development)

### Requirements
- Node.js 20 (install via `brew install node@20` on Mac)

### Start the dashboard
```bash
cd electron-app
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm install
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm start
```

---

## ☁️ Cloud Infrastructure (Free)

| Service | Purpose | URL |
|---|---|---|
| **Render** | Hosts the Express + Socket.io server | `https://quickbite-2-m1sd.onrender.com` |
| **Supabase** | PostgreSQL database (menu, orders, settings) | Free tier |
| **GitHub Pages** | Hosts the customer menu HTML | `https://amnaalykhan.github.io/quickbite/customer-menu/` |

> **Note:** Render's free tier sleeps after 15 min of inactivity. The customer menu shows a friendly "waking up" screen (~30s) on first scan of the day, then stays fast for the rest of service.

---

## 🔧 Updating the Menu

Inside the app → **Menu Editor**:
- Add / remove categories and items
- Toggle items available / unavailable
- Edit prices inline

---

## 📱 QR Codes

Inside the app → click **📱 QR Codes**:
- Download PNG for each table individually
- **Download All** — saves every table as a numbered PNG
- **Print All** — opens a print-ready page (3 columns, ready to cut & laminate)

QR codes point to:
```
https://amnaalykhan.github.io/quickbite/customer-menu/?table=N
```

---

## 📦 Building Installers

### Windows (.exe)
```bash
cd electron-app
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm install
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm run build
# Output: electron-app/dist/QuickBite Setup 1.0.0.exe
```

### macOS (.dmg — Apple Silicon)
```bash
cd electron-app
PATH="/opt/homebrew/opt/node@20/bin:$PATH" npm run build-mac
# Output: electron-app/dist/QuickBite-1.0.0-arm64.dmg
```

---

## ⚙️ Settings (per restaurant)

Inside the app → **Settings**:
- Restaurant name & tagline
- Currency symbol (₹, $, €, etc.)
- Number of tables
- Server URL (cloud or local)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Desktop app | Electron 29 |
| Local server | Node.js + Express + Socket.io |
| Cloud server | Express + Socket.io on Render (free) |
| Database | PostgreSQL on Supabase (free) |
| Customer menu | Plain HTML/CSS/JS on GitHub Pages (free) |
| Installers | electron-builder |
