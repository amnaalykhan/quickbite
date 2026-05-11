# QuickBite — Claude Code Setup Guide

## What You Have
```
quickbite/
├── electron-app/          ← Windows desktop app (counter dashboard)
│   ├── main.js
│   ├── server.js          ← Express + Socket.io + SQLite
│   ├── preload.js
│   ├── package.json
│   ├── assets/            ← Put icon.ico here
│   └── dashboard/
│       └── index.html     ← Counter UI
└── customer-menu/
    └── index.html         ← Customer phone menu
```

---

## STEP 1 — Install Node.js (Do this once)

Download from: https://nodejs.org (choose LTS)
Install it. Then verify:
```
node --version
npm --version
```

---

## STEP 2 — Open Claude Code

Install Claude Code:
```
npm install -g @anthropic/claude-code
```

Then open your terminal in the quickbite folder and run:
```
claude
```

---

## STEP 3 — Install Dependencies (Tell Claude Code this)

Type this in Claude Code:
```
Install all npm dependencies for the electron-app folder
```

Claude Code will run:
```
cd electron-app && npm install
```

---

## STEP 4 — Run the App (Tell Claude Code this)

```
Start the QuickBite app in development mode
```

Claude Code runs:
```
cd electron-app && npm start
```

The counter dashboard window opens on your screen.

---

## STEP 5 — Find Your IP Address

Go to Settings tab in the app.
Your server URL will show: http://192.168.x.x:3000
This is what customers use.

Or ask Claude Code:
```
What is the local IP address of this machine?
```

---

## STEP 6 — Test on Your Phone

1. Connect phone to SAME WiFi as the PC
2. Open phone browser
3. Go to: http://[YOUR-IP]:3000
4. You should see the customer menu!

---

## STEP 7 — Update Menu for a Restaurant

Ask Claude Code:
```
Update the menu in server.js with these items:
- Category: Starters
  - Samosa (Veg) ₹40
  - Chicken Tikka ₹280
- Category: Main Course  
  - Dal Fry (Veg) ₹180
  - Butter Chicken ₹320
```

Claude Code will edit the seedMenu() function in server.js.

OR use the Menu Editor inside the app (no coding needed).

---

## STEP 8 — Change Restaurant Name

Ask Claude Code:
```
Change the restaurant name to "Spice Garden" and tagline to "Authentic Home Cooking"
```

OR go to Settings tab in the app and type it there.

---

## STEP 9 — Build Windows .exe Installer

Ask Claude Code:
```
Build the QuickBite Windows installer .exe
```

Claude Code runs:
```
cd electron-app && npm run build
```

Output: `electron-app/dist/QuickBite Setup 1.0.0.exe`

Copy this to a USB. Install on restaurant PC. Done.

---

## USEFUL CLAUDE CODE COMMANDS

| What you want | Say to Claude Code |
|---|---|
| Start the app | "Start QuickBite in dev mode" |
| Add a menu item | "Add Chicken Biryani ₹340 to Main Course category" |
| Change price | "Change price of Butter Naan to ₹70" |
| Delete an item | "Remove Mushroom Pepper Fry from menu" |
| Add new category | "Add a Soups category with emoji 🍲" |
| Build installer | "Build the Windows .exe installer" |
| Fix any error | Paste the error message and say "fix this" |
| Reset menu | "Reset the database with fresh sample menu" |
| Add more tables | "Change table count to 20" |
| See the database | "Show me all menu items in the database" |

---

## HOW ORDERS FLOW

```
Customer Phone                    Restaurant PC
─────────────                    ─────────────
Scan QR Code
     ↓
Opens browser menu
     ↓
Selects items → Place Order
     ↓
POST /api/orders ──────────────→ Server receives
                                       ↓
                                 Socket.io emits "new-order"
                                       ↓
                                 Dashboard shows instantly 🔔
                                       ↓
                                 Staff clicks "Start Preparing"
                                       ↓
                                 Staff clicks "Done" ✓
```

---

## COMMON ERRORS & FIXES

### "EADDRINUSE: port 3000 already in use"
Ask Claude Code:
```
Kill whatever is running on port 3000 and restart the app
```

### "Cannot find module 'better-sqlite3'"
Ask Claude Code:
```
Reinstall npm dependencies in electron-app
```

### "Customers can't connect on their phone"
- Make sure SAME WiFi network
- Check Windows Firewall — allow Node.js
- Ask Claude Code: "How to allow port 3000 through Windows Firewall"

### App won't build to .exe
Ask Claude Code:
```
Why is the electron-builder failing and how to fix it
```

---

## PER-RESTAURANT SETUP CHECKLIST

- [ ] Install QuickBite.exe on their PC
- [ ] Open app → go to Settings
- [ ] Enter restaurant name, tagline, currency, table count
- [ ] Go to Menu Editor → add their actual menu items
- [ ] Click QR Codes → print all table QR cards
- [ ] Laminate QR cards, place on tables
- [ ] Test: scan QR from your phone → place test order → see it on dashboard
- [ ] Train staff (10 minutes max)
- [ ] Collect ₹10,000 💰

---

## DATABASE LOCATION (if you need to reset)

```
Windows: C:\Users\<username>\AppData\Roaming\quickbite\quickbite.db
```

Delete this file to reset everything to fresh sample menu.

---

## TIPS

- App must be RUNNING for orders to work
- PC must stay ON during restaurant hours  
- Restart app daily for best performance
- QR codes are tied to PC's IP — if IP changes, regenerate QR codes from Settings
