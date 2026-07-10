#!/bin/bash
set -euo pipefail
exec > >(tee -a /var/log/voxel-combat-arena-install.log) 2>&1

REPO_URL="https://github.com/YOUR_GITHUB_USERNAME/voxel-arena.git"
APP_DIR="/opt/voxel-arena"
APP_USER="ec2-user"

echo "Installing Voxel Combat Arena..."

TOKEN=$(curl -fsS -X PUT \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
  http://169.254.169.254/latest/api/token || true)

if [ -n "${TOKEN:-}" ]; then
  EC2_AZ=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/placement/availability-zone || echo "unknown")
  INSTANCE_ID=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
else
  EC2_AZ="unknown"
  INSTANCE_ID="unknown"
fi

dnf install -y git nginx nodejs npm

systemctl stop voxel-arena 2>/dev/null || true
rm -rf "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
runuser -u "$APP_USER" -- git clone "$REPO_URL" "$APP_DIR"

cd "$APP_DIR"
runuser -u "$APP_USER" -- npm install --omit=dev
runuser -u "$APP_USER" -- npm run check

cat > /etc/voxel-arena.env <<ENV
PORT=3000
NODE_ENV=production
EC2_AZ=$EC2_AZ
INSTANCE_ID=$INSTANCE_ID
ENV

cat > /etc/systemd/system/voxel-arena.service <<'SERVICE'
[Unit]
Description=Voxel Combat Arena Multiplayer Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/voxel-arena
EnvironmentFile=/etc/voxel-arena.env
ExecStart=/usr/bin/node /opt/voxel-arena/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/voxel-arena
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/nginx/nginx.conf <<'NGINX'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

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
            proxy_read_timeout 3600;
            proxy_send_timeout 3600;
        }
    }
}
NGINX

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
nginx -t
systemctl daemon-reload
systemctl enable --now voxel-arena
systemctl enable --now nginx
sleep 4
curl -fsS http://127.0.0.1:3000/api/status || true

echo "Voxel Combat Arena deployment complete."
