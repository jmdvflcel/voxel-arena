#!/bin/bash
set -Eeuo pipefail
exec > >(tee -a /var/log/voxel-combat-arena-install.log) 2>&1

REPO_URL="https://github.com/jmdvflcel/voxel-arena.git"
APP_DIR="/opt/voxel-arena"
STAGE_DIR="/opt/voxel-arena.stage.$$"
BACKUP_DIR="/opt/voxel-arena.backup"
APP_USER="ec2-user"

cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT

echo "=== Voxel Combat Arena v8.9 resilient installation ==="
dnf install -y git nginx nodejs npm curl
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

TOKEN=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600' http://169.254.169.254/latest/api/token || true)
if [ -n "${TOKEN:-}" ]; then
  export EC2_AZ=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/placement/availability-zone || echo unknown)
  export INSTANCE_ID=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id || echo unknown)
else
  export EC2_AZ=unknown INSTANCE_ID=unknown
fi

rm -rf "$STAGE_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$STAGE_DIR"
for attempt in 1 2 3; do
  if runuser -u "$APP_USER" -- git clone --depth 1 "$REPO_URL" "$STAGE_DIR"; then break; fi
  echo "Git clone attempt $attempt failed"
  rm -rf "$STAGE_DIR"; install -d -o "$APP_USER" -g "$APP_USER" "$STAGE_DIR"; sleep 4
done
[ -f "$STAGE_DIR/package.json" ] || { echo "Repository clone failed"; exit 1; }

cd "$STAGE_DIR"
rm -rf node_modules package-lock.json /tmp/voxel-npm-cache
install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache
runuser -u "$APP_USER" -- npm config set registry https://registry.npmjs.org/
for attempt in 1 2 3; do
  set +e
  runuser -u "$APP_USER" -- env npm_config_cache=/tmp/voxel-npm-cache npm install --omit=dev --no-audit --no-fund --package-lock=false
  npm_exit=$?
  set -e
  if [ -f node_modules/express/package.json ] && [ -f node_modules/ws/package.json ] && [ -f node_modules/three/build/three.module.js ]; then
    echo "Dependencies verified (npm exit $npm_exit)"
    break
  fi
  echo "Dependency attempt $attempt failed"; rm -rf node_modules /tmp/voxel-npm-cache; install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache; sleep 5
done
[ -f node_modules/express/package.json ] || { echo "Dependencies unavailable"; exit 1; }
runuser -u "$APP_USER" -- npm run check
runuser -u "$APP_USER" -- env npm run smoke

systemctl stop voxel-arena 2>/dev/null || true
rm -rf "$BACKUP_DIR"
[ ! -d "$APP_DIR" ] || mv "$APP_DIR" "$BACKUP_DIR"
mv "$STAGE_DIR" "$APP_DIR"
trap - EXIT
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$APP_DIR/tools/install-system.sh"
systemctl restart voxel-arena nginx

for attempt in $(seq 1 35); do
  if curl -fsS http://127.0.0.1:3000/api/status >/tmp/voxel-status.json; then cat /tmp/voxel-status.json; echo; echo "Health check passed"; rm -rf "$BACKUP_DIR"; echo "=== Voxel Combat Arena v8.9 installation complete ==="; exit 0; fi
  sleep 2
done

echo "Health check failed; restoring previous release"
journalctl -u voxel-arena -n 150 --no-pager || true
systemctl stop voxel-arena || true
rm -rf "$APP_DIR"
if [ -d "$BACKUP_DIR" ]; then mv "$BACKUP_DIR" "$APP_DIR"; APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$APP_DIR/tools/install-system.sh"; systemctl restart voxel-arena nginx; fi
exit 1
