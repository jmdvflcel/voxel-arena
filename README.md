# Voxel Combat Arena v4.2

A polished multiplayer team-combat prototype designed for an AWS EC2 `t3.micro`.

## What is included

### Performance

- Instanced, chunk-organized arena rendering
- Shared materials and geometry
- Pooled tracers, muzzle flashes, sparks, and dust
- Dynamic resolution scaling
- Three graphics presets
- Frustum and distance culling through Three.js
- 20 Hz authoritative server simulation
- 10 Hz network snapshots
- Remote-player interpolation
- Soft client/server position reconciliation
- Nearby-player interest filtering
- WebSocket compression disabled to reduce memory pressure

### Combat

- Team deathmatch
- Arc Blade with three-hit combos
- Blocking and timing-based parries
- Pulse Pistol
- Automatic Vector Rifle
- Scatter Cannon shotgun
- Longshot marksman rifle
- Server-validated ammunition, reloads, fire rates, damage, range, and teams
- Approximate lag-compensated hitscan using recent server position history
- Armor and health
- Headshots
- Assists
- Spawn protection
- Weapon, health, armor, and ammunition pickups

### Movement

- Smooth acceleration and stopping
- Sprinting
- Crouching
- Sliding
- Jumping
- Low-wall mantling
- Air control
- Camera bob
- Landing response
- Strafe camera tilt
- Aim-down-sights FOV transitions
- Weapon recoil and sway

### Presentation

- Original procedural pixel-style textures
- Stylized arena lighting
- Moving day/night lighting
- Animated first-person weapons
- Animated remote players
- Usernames and health bars above players
- Radar
- Kill feed
- Scoreboard
- Chat
- Match timer
- Health, armor, ammunition, weapon slots, latency, FPS, and resolution HUD
- Generated Web Audio sound effects

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
    └── js/
        ├── audio.js
        ├── config.js
        ├── effects.js
        ├── main.js
        ├── network.js
        ├── player.js
        └── world.js
```

## Controls

| Control | Action |
|---|---|
| `WASD` | Move |
| Mouse | Look |
| `Shift` | Sprint |
| `C` or Left Ctrl | Crouch / slide |
| `Space` | Jump / mantle |
| Left click | Fire / sword attack |
| Right click | Aim / sword block |
| `R` | Reload |
| `1–5` | Select weapon |
| `Enter` | Chat |
| Hold `Tab` | Scoreboard |
| `Esc` | Settings |

## Deploy to EC2

1. Upload all files from the ZIP to the root of your public GitHub repository.
2. Confirm `user-data.sh` contains the correct repository URL.
3. Launch an **Amazon Linux 2023** EC2 instance.
4. A `t3.micro` works for a small classroom lobby.
5. Add an inbound Security Group rule:

```text
Type: HTTP
Protocol: TCP
Port: 80
Source: 0.0.0.0/0
```

6. Paste the complete contents of `user-data.sh` into **Advanced details → User data**.
7. Leave the base64 checkbox unchecked.
8. Launch the instance and wait several minutes.
9. Open:

```text
http://YOUR-PUBLIC-IP
```

## Updating an existing instance

After replacing the GitHub files:

```bash
cd /opt/voxel-arena
sudo -u ec2-user git fetch origin
sudo -u ec2-user git reset --hard origin/main
sudo -u ec2-user npm install --omit=dev
sudo -u ec2-user npm run check
sudo systemctl restart voxel-arena
sudo systemctl restart nginx
```

## Troubleshooting

```bash
sudo systemctl status voxel-arena --no-pager
sudo systemctl status nginx --no-pager
sudo journalctl -u voxel-arena -n 150 --no-pager
sudo tail -n 150 /var/log/voxel-combat-arena-install.log
curl -v http://127.0.0.1:3000/api/status
sudo nginx -t
```

## Scope

This is an advanced classroom/portfolio prototype, not a commercial AAA game. It keeps graphics and effects in the browser while the EC2 instance handles authoritative movement, combat, teams, matches, pickups, and networking.

## Version 4.2 camera and movement update

- Correct standard WASD controls: W forward, S backward, A left, D right.
- Press `V` to switch instantly between first-person and third-person views.
- Camera mode can also be selected from the main and pause menus.
- The local character, username, health bar, animations, and equipped weapon are visible in third person.
- Other players remain fully visible with usernames, health, team colors, and equipped weapons.
- Gun recoil now uses damped spring animation.
- Bullet tracers travel smoothly instead of appearing as static lines.
- Third-person camera includes wall collision and smooth follow interpolation.
