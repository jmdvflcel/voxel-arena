#!/bin/bash
set -Eeuo pipefail
exec > >(tee -a /var/log/voxel-combat-arena-update.log) 2>&1

REPO_URL="https://github.com/jmdvflcel/voxel-arena.git"
APP_DIR="/opt/voxel-arena"
STAGE_DIR="/opt/voxel-arena.stage.$$"
BACKUP_DIR="/opt/voxel-arena.rollback"
APP_USER="ec2-user"
SWAPPED=0

rollback() {
  code=$?
  if [ "$SWAPPED" -eq 1 ] && [ -d "$BACKUP_DIR" ]; then
    echo "Update failed; restoring the last healthy release"
    systemctl stop voxel-arena 2>/dev/null || true
    rm -rf "$APP_DIR"
    mv "$BACKUP_DIR" "$APP_DIR"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR"
    APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$APP_DIR/tools/install-system.sh" || true
    systemctl restart voxel-arena nginx || true
  fi
  rm -rf "$STAGE_DIR"
  exit "$code"
}
trap rollback ERR

echo "=== Updating Voxel Combat Arena v9.0 ==="
dnf install -y git nginx nodejs npm curl >/dev/null
rm -rf "$STAGE_DIR"
install -d -o "$APP_USER" -g "$APP_USER" "$STAGE_DIR"
runuser -u "$APP_USER" -- git clone --depth 1 "$REPO_URL" "$STAGE_DIR"
cd "$STAGE_DIR"
rm -rf node_modules package-lock.json /tmp/voxel-npm-cache
install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache
runuser -u "$APP_USER" -- npm config set registry https://registry.npmjs.org/

DEPENDENCIES_OK=0
for attempt in 1 2 3; do
  set +e
  runuser -u "$APP_USER" -- env npm_config_cache=/tmp/voxel-npm-cache npm install --omit=dev --no-audit --no-fund --package-lock=false
  npm_exit=$?
  set -e
  if [ -f node_modules/express/package.json ] && [ -f node_modules/ws/package.json ] && [ -f node_modules/three/build/three.module.js ]; then DEPENDENCIES_OK=1; echo "Dependencies verified (npm exit $npm_exit)"; break; fi
  rm -rf node_modules /tmp/voxel-npm-cache; install -d -o "$APP_USER" -g "$APP_USER" /tmp/voxel-npm-cache; sleep 5
done
[ "$DEPENDENCIES_OK" -eq 1 ] || { echo "Dependency installation failed"; exit 1; }
runuser -u "$APP_USER" -- npm run check
runuser -u "$APP_USER" -- env npm run smoke

systemctl stop voxel-arena 2>/dev/null || true
rm -rf "$BACKUP_DIR"
[ ! -d "$APP_DIR" ] || mv "$APP_DIR" "$BACKUP_DIR"
mv "$STAGE_DIR" "$APP_DIR"
SWAPPED=1
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
APP_DIR="$APP_DIR" APP_USER="$APP_USER" bash "$APP_DIR/tools/install-system.sh"
systemctl restart voxel-arena nginx

for attempt in $(seq 1 35); do
  if curl -fsS http://127.0.0.1:3000/api/status >/tmp/voxel-status.json; then
    cat /tmp/voxel-status.json; echo
    rm -rf "$BACKUP_DIR"
    SWAPPED=0
    trap - ERR
    echo "=== Voxel Combat Arena v9.0 update complete ==="
    exit 0
  fi
  sleep 2
done

echo "New release failed health check"
journalctl -u voxel-arena -n 150 --no-pager || true
exit 1
