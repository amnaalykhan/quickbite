# 🍽 QuickBite — Smart Restaurant Ordering System

## What Is This?
- **Restaurant staff** install a Windows `.exe` app on the counter PC
- **Customers** scan a QR code, menu opens in their phone browser — no app needed
- Orders appear **live** on the counter dashboard the moment a customer places them

---

## 📁 Project Structure
```
quickbite/
├── electron-app/        ← Windows desktop app (counter dashboard)
│   ├── main.js          ← Electron entry point
│   ├── server.js        ← Express + Socket.io + SQLite server
│   ├── preload.js       ← Electron IPC bridge
│   ├── dashboard/
│   │   └── index.html   ← Counter dashboard UI
│   └── package.json
└── customer-menu/
    └── index.html       ← Customer mobile menu page
```

---

## 🚀 How to Run for Development / Trial

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version)

### Step 2 — Install dependencies
Open terminal in the `electron-app` folder:
```bash
npm install
```

### Step 3 — Run the app
```bash
npm start
```
The counter dashboard opens. The server starts on port 3000.

### Step 4 — Find your PC's local IP
The Settings page inside the app shows your IP (e.g. `http://192.168.1.5:3000`)

### Step 5 — Generate QR codes
Click **"QR Codes"** button in the app. Each table gets a QR.
Print them and place on tables.

### Step 6 — Customer orders
Customer scans QR → menu opens on phone → they order → you see it live!

---

## 🔧 How to Update the Menu (For Each Restaurant)

### Option A — Inside the App (Easiest)
1. Open QuickBite
2. Go to **Menu Editor** in sidebar
3. Add/remove categories and items
4. Toggle items available/unavailable
5. Edit prices inline

### Option B — Edit the database directly
The SQLite database is at:
`C:\Users\<username>\AppData\Roaming\quickbite\quickbite.db`
Use "DB Browser for SQLite" (free) to edit it visually.

---

## 📦 Build Windows Installer (.exe)

### Requirements
- Node.js installed
- Run on a Windows machine (or use Wine on Mac/Linux)

### Build command
```bash
cd electron-app
npm install
npm run build
```

The installer will be at: `electron-app/dist/QuickBite Setup 1.0.0.exe`

---

## ⚙️ Settings You Can Change Per Restaurant

Inside the app → Settings:
- Restaurant name & tagline
- Currency symbol (₹, $, €, etc.)
- Number of tables

---

## ⚠️ Important Notes

1. **WiFi** — The restaurant PC and customer phones must be on the same WiFi
2. **PC must stay on** — The app must be running for orders to work
3. **Port 3000** — Windows Firewall may block it. Allow it when prompted.
4. **QR codes** — Reprint if the PC's IP changes (rare on most routers)

---

## 🛠 Tech Stack
- **Electron** — Windows desktop app shell
- **Node.js + Express** — HTTP server (runs inside Electron)
- **Socket.io** — Real-time order push to counter
- **SQLite (better-sqlite3)** — Local database, no setup needed
- **HTML + CSS + JS** — Customer menu (no framework, runs on any phone)

---

## 📞 Troubleshooting

| Problem | Fix |
|---|---|
| "Cannot connect" on phone | Make sure phone is on same WiFi as PC |
| Port already in use | Restart the app or change port in server.js |
| Orders not showing live | Refresh the dashboard, check WiFi |
| Menu not loading | Restart the app |

---

Made with ❤️ by QuickBite
