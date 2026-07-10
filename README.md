# Voxel Arena — Milestone 1

A multiplayer browser-based voxel sandbox designed to run on AWS EC2.

## Included

- Procedural voxel terrain
- First-person movement
- Jumping and sprinting
- Block breaking and placement
- Seven selectable block types
- Multiplayer movement synchronization
- Shared block edits
- Multiplayer chat
- EC2 Availability Zone and instance ID in the HUD
- Nginx reverse proxy
- systemd auto-start service

## GitHub upload

Upload every file and folder in this project to the root of your repository.

Expected layout:

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

1. Edit `REPO_URL` inside `user-data.sh`.
2. Copy the complete contents of `user-data.sh` into EC2 User Data.
3. Use Amazon Linux 2023.
4. Allow inbound TCP port 80 from `0.0.0.0/0`.
5. Launch the instance and wait several minutes.
6. Open `http://PUBLIC-IP`.

## Troubleshooting

SSH into the instance and run:

```bash
sudo systemctl status voxel-arena --no-pager
sudo systemctl status nginx --no-pager
sudo journalctl -u voxel-arena -n 100 --no-pager
```
