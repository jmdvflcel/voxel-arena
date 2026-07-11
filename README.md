# Voxel Combat Arena v6

A browser-based multiplayer FPS/melee arena designed for AWS EC2 t3.micro.

## v6 highlights

- More accurate server-authoritative gunplay with ADS, movement, crouch, airborne, and recoil-bloom accuracy states
- Permanent grappling hook for every player (`E`)
- True scoped first-person ADS overlays and centered weapon sights
- Two-second server-recorded, skippable kill cam (`F`, Space, or click)
- Rare one-hit Void Reaper sword with randomized appearance windows
- Expanded 68×68 arena with stairs to all major pickups, grapple towers, and elevated anchors
- First- and third-person weapon/character rendering, usernames, health bars, recoil, tracers, powers, and pickups
- Smooth prediction/interpolation and t3.micro-safe authoritative networking

## Controls

- WASD: move
- Mouse: look
- Left click: fire/attack
- Right click: ADS or melee block
- E: grapple / cancel grapple
- Q: dash when Blink Core is active
- Space: jump/mantle or skip kill cam
- Shift: sprint
- C: crouch/slide
- R: reload
- 1–9: normal weapons
- 0: rare Void Reaper after pickup
- V: first/third person
- F: skip kill cam
- Enter: chat
- Tab: scoreboard

## Deploy

Upload all project files to `https://github.com/jmdvflcel/voxel-arena`, then use `user-data.sh` for a new Amazon Linux 2023 instance. Allow inbound HTTP TCP 80.

Update an existing instance:

```bash
curl -fsSL https://raw.githubusercontent.com/jmdvflcel/voxel-arena/main/update-existing-instance.sh | sudo bash
```
