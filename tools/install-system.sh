#!/bin/bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/voxel-arena}"
APP_USER="${APP_USER:-ec2-user}"
NODE_BIN="$(command -v node)"
BUILD_COMMIT="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo manual)"

if [ ! -f /etc/voxel-arena.env ]; then
  cat > /etc/voxel-arena.env <<ENV
PORT=3000
NODE_ENV=production
EC2_AZ=${EC2_AZ:-unknown}
INSTANCE_ID=${INSTANCE_ID:-unknown}
BUILD_COMMIT=$BUILD_COMMIT
BOT_COUNT=2
ROOM_CODE=
ENV
else
  sed -i "s/^BUILD_COMMIT=.*/BUILD_COMMIT=$BUILD_COMMIT/" /etc/voxel-arena.env || true
  grep -q '^BUILD_COMMIT=' /etc/voxel-arena.env || echo "BUILD_COMMIT=$BUILD_COMMIT" >> /etc/voxel-arena.env
  grep -q '^BOT_COUNT=' /etc/voxel-arena.env || echo 'BOT_COUNT=2' >> /etc/voxel-arena.env
  grep -q '^ROOM_CODE=' /etc/voxel-arena.env || echo 'ROOM_CODE=' >> /etc/voxel-arena.env
fi
chmod 640 /etc/voxel-arena.env

cat > /etc/systemd/system/voxel-arena.service <<SERVICE
[Unit]
Description=Voxel Combat Arena v8.2 Multiplayer Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=/etc/voxel-arena.env
ExecStart=$NODE_BIN $APP_DIR/server.js
Restart=always
RestartSec=3
TimeoutStopSec=15
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/nginx/nginx.conf <<'NGINX'
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;
events { worker_connections 2048; multi_accept on; }
http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;
  types_hash_max_size 4096;
  server_tokens off;
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  gzip on;
  gzip_comp_level 5;
  gzip_min_length 1024;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml application/wasm;
  map $http_upgrade $connection_upgrade { default upgrade; '' close; }
  server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    location / {
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
      proxy_buffering off;
      proxy_read_timeout 3600;
      proxy_send_timeout 3600;
    }
    location = /api/status { proxy_pass http://127.0.0.1:3000/api/status; access_log off; }
  }
}
NGINX
nginx -t
systemctl daemon-reload
systemctl enable voxel-arena nginx
