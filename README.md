# MemoryVault

Production-ready family tree platform with:
- JWT auth + role-based access
- private/public tree access controls
- transaction-safe tree/member mutations
- integrity check tooling
- large-tree focused rendering and exports
- Razorpay-powered SaaS billing
- SMTP email workflows
- audit logs and notifications

## Project Structure

- `client/` Next.js frontend (App Router + TypeScript + D3)
- `server/` Express + MongoDB backend
- `docs/` API and setup docs
- `scripts/` production build scripts

## Prerequisites

- Node.js 20+
- npm 10+
- MongoDB 7+ (local or managed)
- Docker + Docker Compose (for containerized run)

## Environment Variables

1. Copy root template:
   - `cp .env.example .env` (Linux/macOS)
   - `Copy-Item .env.example .env` (PowerShell)
2. Update secure values, especially `JWT_SECRET`.

Server-specific example remains at `server/.env.example`.
Client-specific example remains at `client/.env.local.example`.

Required core variables:
- `MONGO_URI`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `JWT_TREE_ACCESS_AUDIENCE`
- `TREE_ACCESS_TOKEN_TTL`
- `FRONTEND_URL`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`
- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_UPLOADS_URL`

## Run In Development

### Server
```bash
cd server
npm install
npm run dev
```

### Client
```bash
cd client
npm install
npm run dev
```

Default URLs:
- Frontend: `http://localhost:3000`
- API: `http://localhost:5000`
- Versioned API base: `http://localhost:5000/api/v1`
- Legacy alias: `http://localhost:5000/api` (kept for compatibility)

## Run In Production (Local Node)

```bash
# from repository root
./scripts/production-build.sh
```

PowerShell:
```powershell
.\scripts\production-build.ps1
```

Then start services:
```bash
cd server && npm start
cd client && npm run start
```

## Run With Docker

```bash
docker compose build
docker compose up -d
```

Services:
- MongoDB: `localhost:27017`
- Server: `localhost:5000`
- Client: `localhost:3000`

## Integrity Checker

### Admin API
- `GET /api/v1/admin/integrity-check`
- Optional query: `treeId=<mongo-id>`

### CLI Script
```bash
cd server
npm run integrity:check
# scoped
npm run integrity:check -- 65f0c4d5f8f4cbe4a8d11a9e
```

Checks:
- broken references
- circular spouse loops
- duplicate relation entries

## Razorpay Checkout

Payment flow is client checkout + backend signature verification:
- `POST /api/v1/payment/create-order`
- `POST /api/v1/payment/verify`

Subscription activation happens only after successful verification.

## Export Features

Tree page supports:
- Export JSON (`memoryvault-<treeId>.json`)
- Export PDF (`memoryvault-<treeId>.pdf`, basic layout)

## Enterprise APIs

- Email:
  - `GET /api/v1/auth/verify-email?token=...`
  - `POST /api/v1/auth/password-reset/request`
  - `POST /api/v1/auth/password-reset/confirm`
- Audit logs:
  - `GET /api/v1/admin/audit-logs?page=1&limit=20`
- Notifications:
  - `GET /api/v1/notifications`
  - `PUT /api/v1/notifications/read/:id`
- Backup:
  - `GET /api/v1/tree/:id/export-full`
  - `POST /api/v1/tree/import`

## Deployment Guides

### VPS (PM2)
1. Install Node.js + MongoDB.
2. Run production build scripts.
3. Start backend with PM2:
   ```bash
   pm2 start server/src/server.js --name memoryvault-api
   ```
4. Start frontend:
   ```bash
   pm2 start "npm run start --prefix client" --name memoryvault-web
   ```
5. Put Nginx in front and proxy:
   - `/api/v1` -> `localhost:5000`
   - `/` -> `localhost:3000`

### Render (Backend)
1. Create new Web Service from `server/`.
2. Build command: `npm install && npm run build`
3. Start command: `npm start`
4. Set environment variables from `.env.example`.
5. Attach a managed MongoDB or external Mongo URI.

### Vercel (Frontend)
1. Import repo and set root directory to `client/`.
2. Build command: `npm run build`
3. Output: Next.js default.
4. Set:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_UPLOADS_URL`

### Railway
Option A: deploy `server/` and `client/` as separate services.
Option B: deploy via `docker-compose.yml` (if workspace plan supports it).

For separate services:
- backend service root: `server/`
- frontend service root: `client/`
- configure env vars from `.env.example`.

## Validation Commands

- Server syntax/build:
  ```bash
  cd server && npm run build
  ```
- Client production build:
  ```bash
  cd client && npm run build
  ```
- Docker build:
  ```bash
  docker compose build
  ```
