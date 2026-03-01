# MemoryVault Setup

## Prerequisites
- Node.js 20+
- MongoDB instance (local or cloud)

## Project Structure
- `client`: Next.js App Router + TypeScript + TailwindCSS + D3 focus engine frontend
- `server`: Express + MongoDB + JWT + role-based + tree privacy API

## 1. Backend Setup
```bash
cd server
npm install
cp .env.example .env
npm run dev
```

## 2. Frontend Setup
```bash
cd client
npm install
cp .env.local.example .env.local
npm run dev
```

## 3. Runtime URLs
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5000`
- Health check: `http://localhost:5000/api/health`

## 4. Dynamic Tree Engine Controls
- Scroll up: focus parent
- Scroll down: focus child
- Scroll left: focus sibling
- Scroll right: focus spouse
- Arrow keys mirror directional focus navigation
- Ctrl + Wheel or +/-: zoom
- Drag canvas: pan

## 5. Privacy + Access
- Trees can be created as:
  - Public
  - Private (password protected)
- Private tree password is required for non-owner/non-admin access.
- Frontend sends tree password via `x-tree-password` header once unlocked.

## 6. Roles
- `user`: full access to owned trees.
- `admin`: global read/write access across trees.

## 7. Core API Summary
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/trees`
- `POST /api/trees`
- `GET /api/trees/:treeId`
- `PUT /api/trees/:treeId`
- `DELETE /api/trees/:treeId`
- `POST /api/trees/:treeId/members`
- `PUT /api/trees/:treeId/members/:memberId`
- `DELETE /api/trees/:treeId/members/:memberId?subtree=true|false`
- `GET /api/trees/:treeId/members/:memberId/relations`