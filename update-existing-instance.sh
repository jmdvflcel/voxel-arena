#!/bin/bash
set -euo pipefail

APP_DIR="/opt/voxel-arena"
APP_USER="ec2-user"

cd "$APP_DIR"
sudo systemctl stop voxel-arena || true
sudo -u "$APP_USER" git fetch origin
sudo -u "$APP_USER" git reset --hard origin/main

sudo rm -rf node_modules package-lock.json /tmp/voxel-npm-cache
sudo install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache
sudo -u "$APP_USER" npm config set registry https://registry.npmjs.org/
sudo -u "$APP_USER" env npm_config_cache=/tmp/voxel-npm-cache \
  npm install --omit=dev --no-audit --no-fund --package-lock=false
sudo -u "$APP_USER" npm run check

sudo systemctl restart voxel-arena
sudo systemctl restart nginx
sleep 3

curl -fsS http://127.0.0.1:3000/api/status
echo
sudo systemctl --no-pager --full status voxel-arena
