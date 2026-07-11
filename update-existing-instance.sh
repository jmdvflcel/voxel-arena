#!/bin/bash
set -euo pipefail

APP_DIR="/opt/voxel-arena"
APP_USER="ec2-user"
REPO_URL="https://github.com/jmdvflcel/voxel-arena.git"

exec > >(tee -a /var/log/voxel-combat-arena-update.log) 2>&1

echo "=== Updating Voxel Combat Arena v6 ==="

if [ ! -d "$APP_DIR/.git" ]; then
  sudo rm -rf "$APP_DIR"
  sudo install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --depth 1 "$REPO_URL" "$APP_DIR"
else
  cd "$APP_DIR"
  sudo systemctl stop voxel-arena || true
  sudo -u "$APP_USER" git fetch --depth 1 origin main
  sudo -u "$APP_USER" git reset --hard origin/main
fi

cd "$APP_DIR"
sudo rm -rf node_modules package-lock.json /tmp/voxel-npm-cache
sudo install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache
sudo -u "$APP_USER" npm config set registry https://registry.npmjs.org/

NPM_OK=0
for attempt in 1 2 3; do
  sudo rm -rf node_modules /tmp/voxel-npm-cache
  sudo install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache

  if sudo -u "$APP_USER" env npm_config_cache=/tmp/voxel-npm-cache \
    npm install --omit=dev --no-audit --no-fund --package-lock=false; then
    NPM_OK=1
    break
  fi

  echo "npm install attempt $attempt failed; retrying..."
  sleep 5
done

if [ "$NPM_OK" -ne 1 ]; then
  echo "npm dependencies failed to install."
  exit 1
fi

sudo -u "$APP_USER" npm run check
sudo chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo systemctl daemon-reload
sudo systemctl restart voxel-arena
sudo systemctl restart nginx

HEALTHY=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/status; then
    echo
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "Server failed its health check."
  sudo journalctl -u voxel-arena -n 120 --no-pager || true
  exit 1
fi

echo "=== Voxel Combat Arena v6 update complete ==="
