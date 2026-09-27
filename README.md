# Hut12
---

## Overview
This platform allows users to sign up, rent products of any category, and earn daily passive income in UGX. Users can also invite friends, earn bonuses, complete VIP tasks, and withdraw their earnings. The application includes a comprehensive Admin Dashboard to manage users, transactions, the product catalog, and global configurations.

Built on Vite + React 19 + Express + Drizzle/MySQL.


## Quick Start
```bash
npm install
cp .env.example .env   # fill OPENROUTER_API_KEY, payment gateway, ADMIN_*
npm run dev            # http://localhost:3000
npm run build && npm run start  # production
```

## Setup & Local Development
...see previous docs / .env.example for full SmarterASP & Render deploy guides.

---
## SmarterASP deployment (Node.js via IISNode — NOT static hosting)
This is a full-stack app: `dist/index.html` alone does nothing without the Express API + MySQL behind it. Static-site advice (uploading `dist` contents to root, skipping `node_modules`/`package.json`/`.env`) will 404 every API call.
1. On your PC run `npm install`, then `npm run build` — verify `dist/server.cjs` exists next to `dist/index.html` (`vite build` alone is not enough; the `esbuild server.ts` step produces the API server).
2. Upload the project root layout as-is to your SmarterASP site root — keep `web.config` at the root (it serves static files from `dist/` and routes everything else to Node):
   `web.config`, `package.json`, `.env` (DB URL + secrets), `dist/` (client + `server.cjs`), `node_modules/` (required — the server bundle keeps packages external).
3. In the SmarterASP panel enable Node.js and set the startup file to `dist/server.cjs` (Node 20+). `PORT` comes from IIS; locally the server uses 3000.
4. Do NOT upload `src/`, and never commit `.env`.
---


## Admin
Set `ADMIN_PHONE/ADMIN_PASSWORD/ADMIN_USERNAME` in `.env`, then visit `/api/admin/access/activate` or `#/admin/access/activate`.

## Screenshots
![Profile](src/assets/screenshots/profile.png)
![My products](src/assets/screenshots/my%20products.png)
![Chat](src/assets/screenshots/chat.png)
![Catalog](src/assets/screenshots/catalog.png)
