# Voxel Combat Arena v3

An advanced multiplayer browser fighting game built for AWS EC2.

## Features

- Four synchronized weapons: Arc Blade, Pulse Pistol, Vector Rifle, Scatter Cannon
- Server-authoritative fire rate, ammo, reloads, damage, armor, kills, and respawns
- Server-side melee direction checks and hitscan target validation
- Basic server-side cover/line-of-sight validation
- Smooth acceleration, deceleration, sprinting, jumping, head bob, aiming, FOV transitions, recoil, and weapon sway
- Interpolated remote player movement and animated limbs/weapons
- Always-visible world-space usernames and health bars
- Polished HUD with health, armor, ammo, reload progress, radar, latency, FPS, score, kill feed, chat, and scoreboard
- First-person weapon models, muzzle effects, tracers, hit markers, damage feedback, and synthesized sound effects
- Nginx WebSocket reverse proxy and systemd automatic startup
- EC2 Availability Zone and instance ID display

## Controls

- WASD: move
- Mouse: aim/look
- Space: jump
- Shift: sprint
- Left mouse: attack/fire
- Right mouse: aim down sights
- R: reload
- 1–4: select weapon
- Enter: chat
- Hold Tab: scoreboard

## Repository layout

```text
voxel-arena/
├── package.json
├── server.js
├── user-data.sh
├── README.md
└── public/
    ├── index.html
    ├── style.css
    └── client.js
```

## EC2 deployment

1. Upload all files to your public GitHub repository, replacing the older versions.
2. Edit `REPO_URL` in `user-data.sh` to match your repository.
3. Copy all of `user-data.sh` into EC2 User Data.
4. Use Amazon Linux 2023.
5. Allow inbound TCP port 80 from `0.0.0.0/0`.
6. Launch the instance and wait several minutes.
7. Open `http://PUBLIC-IP`.

## Update an already-running instance

```bash
cd /opt/voxel-arena
sudo -u ec2-user git pull
sudo -u ec2-user npm install --omit=dev
sudo -u ec2-user npm run check
sudo systemctl restart voxel-arena nginx
```

## Troubleshooting

```bash
sudo systemctl status voxel-arena --no-pager
sudo systemctl status nginx --no-pager
sudo journalctl -u voxel-arena -n 150 --no-pager
sudo cat /var/log/voxel-combat-arena-install.log
```
