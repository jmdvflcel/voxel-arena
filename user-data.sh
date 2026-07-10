#!/bin/bash
set -euxo pipefail

REPO_URL="https://github.com/YOUR_GITHUB_USERNAME/voxel-arena.git"
APP_DIR="/opt/voxel-arena"

TOKEN=$(curl -sS -X PUT \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
  http://169.254.169.254/latest/api/token)

EC2_AZ=$(curl -sS \
  -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/placement/availability-zone)

INSTANCE_ID=$(curl -sS \
  -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/instance-id)

dnf update -y
dnf install -y git nginx nodejs npm

rm -rf "$APP_DIR"
git clone "$REPO_URL" "$APP_DIR"

cd "$APP_DIR"
npm install --omit=dev

cat > /etc/voxel-arena.env <<ENV
PORT=3000
EC2_AZ=$EC2_AZ
INSTANCE_ID=$INSTANCE_ID
ENV

cat > /etc/systemd/system/voxel-arena.service <<'SERVICE'
[Unit]
Description=Voxel Blade Arena Node Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/voxel-arena
EnvironmentFile=/etc/voxel-arena.env
ExecStart=/usr/bin/node /opt/voxel-arena/server.js
Restart=always
RestartSec=3
User=ec2-user
Group=ec2-user

[Install]
WantedBy=multi-user.target
SERVICE

chown -R ec2-user:ec2-user "$APP_DIR"

cat > /etc/nginx/conf.d/voxel-arena.conf <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Real-IP $remote_addr;
    }
}
NGINX

rm -f /etc/nginx/conf.d/default.conf

systemctl daemon-reload
systemctl enable --now voxel-arena
systemctl enable --now nginx
