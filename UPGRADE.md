# Upgrade to Voxel Combat Arena v9.1

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

The update script stages and validates the new release before swapping it into `/opt/voxel-arena`. Version 9.1 adds render-loop and server snapshot optimizations, backpressure protection, graceful shutdown, stronger deployment safeguards, and a 24-client load test while retaining v9.0 ADS visibility and exact hit alignment.
