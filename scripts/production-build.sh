#!/usr/bin/env bash
set -euo pipefail

echo "[1/2] Server syntax/build check"
(cd server && npm run build)

echo "[2/2] Client production build"
(cd client && npm run build)

echo "Production build completed successfully."
