# Voxel Combat Arena v5

An advanced multiplayer browser combat game built for AWS EC2, Node.js, WebSockets, and Three.js.

## Major features

- First-person and third-person cameras (`V`)
- Standard WASD movement with fixed-step client simulation
- Smooth acceleration, coyote-time jumping, jump buffering, sliding, mantling, and air control
- Server-authoritative 30 Hz movement and combat simulation
- 15 Hz network snapshots with remote-player interpolation
- Sub-stepped world collision to reduce tunneling and snagging
- Precision head, torso, and leg hit zones with lag compensation
- Visible player characters, usernames, health bars, team colors, and equipped weapons
- Visible first-person hands and weapons with recoil springs, sway, reload poses, muzzle flashes, and tracers
- Team Deathmatch, respawning, scoreboard, radar, chat, kill feed, assists, armor, and headshots

## Weapons

1. Arc Blade
2. Pulse Pistol
3. Viper SMG
4. Vector Rifle
5. Trident Burst Rifle
6. Scatter Cannon
7. Titan LMG
8. Longshot Marksman Rifle
9. Apex Railgun

Special weapons appear as contested arena pickups. Players spawn with the sword, pistol, SMG, and rifle.

## Power pickups

- **Overdrive:** faster movement
- **Blink Core:** press `Q` to dash, then wait for its short recharge
- **Aegis Shield:** increases armor up to 200
- **Accelerator:** faster weapon fire rate
- **Amplifier:** increased damage
- **Regen Field:** regenerates health after avoiding damage
- **Gravity Coil:** higher jumps and improved air control

## Controls

| Key | Action |
|---|---|
| `W A S D` | Move |
| Mouse | Look and aim |
| Left click | Fire or melee attack |
| Right click | Aim down sights or sword block |
| `Space` | Jump or mantle |
| `Shift` | Sprint |
| `C` / Left Ctrl | Crouch or slide |
| `Q` | Dash while Blink Core is active |
| `R` | Reload |
| `1`–`9` | Select weapon |
| `V` | Switch first/third person |
| `Enter` | Chat |
| Hold `Tab` | Scoreboard |
| `Esc` | Settings |

## Repository layout

```text
voxel-arena/
├── package.json
├── server.js
├── user-data.sh
├── update-existing-instance.sh
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

## Deploy a new EC2 instance

1. Upload this project to the public GitHub repository `https://github.com/jmdvflcel/voxel-arena`.
2. Use Amazon Linux 2023 on EC2.
3. Allow inbound TCP port 80 from `0.0.0.0/0` in the Security Group.
4. Paste `user-data.sh` into **Advanced details → User data**.
5. Leave the base64 checkbox unchecked.
6. Launch the instance and wait for both status checks plus several minutes for installation.
7. Open `http://PUBLIC-IP`.

## Update an existing instance

After committing the new files to GitHub, run:

```bash
curl -fsSL https://raw.githubusercontent.com/jmdvflcel/voxel-arena/main/update-existing-instance.sh | sudo bash
```

Then force-refresh the browser with `Ctrl + F5`.

## Troubleshooting

```bash
sudo systemctl status voxel-arena --no-pager -l
sudo systemctl status nginx --no-pager -l
sudo journalctl -u voxel-arena -n 120 --no-pager
curl http://127.0.0.1:3000/api/status
```
