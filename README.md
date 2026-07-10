# Voxel Blade Arena

A multiplayer browser-based sword fighting game designed for AWS EC2.

## Features

- First-person sword combat
- Server-validated melee range and attack direction
- 100 health and 25 damage per hit
- Kill/death scoreboard
- Respawning
- Spawn protection
- Multiplayer movement synchronization
- Chat and kill feed
- Voxel combat arena
- AWS Availability Zone and instance ID display
- Nginx reverse proxy
- systemd automatic startup

## Controls

- `WASD`: Move
- Mouse: Look
- `Space`: Jump
- `Shift`: Sprint
- Left click: Sword attack
- `Enter`: Chat
- Hold `Tab`: Scoreboard

## GitHub layout

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

## Deploy to EC2

1. Upload these files to your existing `voxel-arena` repository, replacing the old versions.
2. Edit `REPO_URL` in `user-data.sh`.
3. Copy `user-data.sh` into EC2 User Data.
4. Use Amazon Linux 2023.
5. Allow inbound HTTP TCP port 80.
6. Launch the instance.
7. Open `http://PUBLIC-IP`.

## Updating an existing instance

If the instance is already running the earlier game:

```bash
cd /opt/voxel-arena
sudo -u ec2-user git pull
sudo -u ec2-user npm install --omit=dev
sudo systemctl restart voxel-arena
sudo systemctl restart nginx
```

## Troubleshooting

```bash
sudo systemctl status voxel-arena --no-pager
sudo systemctl status nginx --no-pager
sudo journalctl -u voxel-arena -n 100 --no-pager
```
