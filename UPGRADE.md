# Upgrade to Voxel Combat Arena v8.7

Upload the contents of this folder to the root of `jmdvflcel/voxel-arena`. Keep `.github`, `public`, and `tools` as folders. Do not nest this entire release folder inside the repository.

The repository root should contain:

```text
.github/
public/
tools/
server.js
package.json
README.md
CHANGELOG.md
user-data.sh
update-existing-instance.sh
```

After committing the replacement release, update the EC2 instance:

```bash
curl -fsSL https://raw.githubusercontent.com/jmdvflcel/voxel-arena/main/update-existing-instance.sh | sudo bash
```

Verify:

```bash
curl -s http://127.0.0.1:3000/api/status
sudo systemctl status voxel-arena --no-pager -l
curl -I http://127.0.0.1/main.js
```

The update script stages and validates the new release before swapping it into `/opt/voxel-arena`. Version 8.6 adds an authoritative roster, reconnect cleanup, ghost-character removal, and stale WebSocket event protection while retaining the v8.5 ADS and hit-alignment improvements.
