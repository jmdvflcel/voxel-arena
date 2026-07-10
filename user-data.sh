#!/bin/bash
set -euo pipefail

exec > >(tee -a /var/log/voxel-combat-arena-install.log) 2>&1

REPO_URL="https://github.com/jmdvflcel/voxel-arena.git"
APP_DIR="/opt/voxel-arena"
APP_USER="ec2-user"

echo "=== Voxel Combat Arena v5 deployment starting ==="

TOKEN=$(curl -fsS -X PUT \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" \
  http://169.254.169.254/latest/api/token || true)

if [ -n "${TOKEN:-}" ]; then
  EC2_AZ=$(curl -fsS \
    -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/placement/availability-zone || echo "unknown")

  INSTANCE_ID=$(curl -fsS \
    -H "X-aws-ec2-metadata-token: $TOKEN" \
    http://169.254.169.254/latest/meta-data/instance-id || echo "unknown")
else
  EC2_AZ="unknown"
  INSTANCE_ID="unknown"
fi

dnf update -y
dnf install -y git nginx nodejs npm

# A small swap file helps npm installation on a 1 GiB t3.micro.
if ! swapon --show | grep -q "/swapfile"; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

systemctl stop voxel-arena 2>/dev/null || true
rm -rf "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"

for attempt in 1 2 3; do
  if runuser -u "$APP_USER" -- git clone --depth 1 "$REPO_URL" "$APP_DIR"; then
    break
  fi

  echo "Git clone attempt $attempt failed."
  rm -rf "$APP_DIR"
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sleep 5
done

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "Repository clone failed or package.json is missing."
  exit 1
fi

cd "$APP_DIR"

# Ignore any environment-specific lockfile and install from the public npm registry.
rm -rf node_modules
rm -f package-lock.json
runuser -u "$APP_USER" -- npm config set registry https://registry.npmjs.org/

NPM_OK=0
for attempt in 1 2 3; do
  rm -rf node_modules /tmp/voxel-npm-cache
  install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache

  if runuser -u "$APP_USER" -- env npm_config_cache=/tmp/voxel-npm-cache \
    npm install --omit=dev --no-audit --no-fund --package-lock=false; then
    NPM_OK=1
    break
  fi

  echo "npm installation attempt $attempt failed; retrying..."
  sleep 5
done

if [ "$NPM_OK" -ne 1 ] || [ ! -f node_modules/express/package.json ] || [ ! -f node_modules/three/build/three.module.js ]; then
  echo "npm dependencies failed to install correctly."
  exit 1
fi

runuser -u "$APP_USER" -- npm run check

cat > /etc/voxel-arena.env <<ENV
PORT=3000
NODE_ENV=production
EC2_AZ=$EC2_AZ
INSTANCE_ID=$INSTANCE_ID
ENV

chmod 644 /etc/voxel-arena.env
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

cat > /etc/systemd/system/voxel-arena.service <<'SERVICE'
[Unit]
Description=Voxel Combat Arena v5 Multiplayer Server
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
TimeoutStopSec=15
LimitNOFILE=65535
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/voxel-arena

[Install]
WantedBy=multi-user.target
SERVICE

cat > /etc/nginx/nginx.conf <<'NGINX'
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

error_log /var/log/nginx/error.log notice;
pid /run/nginx.pid;

events {
    worker_connections 2048;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    types_hash_max_size 2048;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent"';

    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    server_tokens off;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types
      text/plain
      text/css
      application/javascript
      application/json
      image/svg+xml;

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

            proxy_buffering off;
            proxy_read_timeout 3600;
            proxy_send_timeout 3600;
        }
    }
}
NGINX

nginx -t

systemctl daemon-reload
systemctl enable voxel-arena
systemctl restart voxel-arena
systemctl enable nginx
systemctl restart nginx

HEALTHY=0
for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/status; then
    echo
    echo "Application health check passed."
    HEALTHY=1
    break
  fi

  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "Application failed its health check."
  journalctl -u voxel-arena -n 120 --no-pager || true
  exit 1
fi

systemctl --no-pager --full status voxel-arena || true
systemctl --no-pager --full status nginx || true

echo "=== Voxel Combat Arena v5 deployment complete ==="
echo "Open http://YOUR-EC2-PUBLIC-IP after allowing inbound TCP port 80."
