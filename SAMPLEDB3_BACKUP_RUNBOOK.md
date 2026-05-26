# SampleDB3 Backup and Restore Runbook

This runbook describes the backup system for the lab deployment of SampleDB3.

## Paths

- Backup environment file: `/etc/sampledb3/backup.env`
- Restic repository: `/opt/sampledb3/backups`
- Application data directory: `/opt/sampledb3/data`
- SQLite database file: `/opt/sampledb3/data/sampledb.sqlite`
- Backup script: `/opt/sampledb3/ops/backup/backup-db-restic.sh`

The backup script uses SQLite's online `.backup` command to create a consistent temporary copy of the live database, then stores that copy in restic as `sampledb.sqlite`.

SQLite may also create these sidecar files next to the database:

- `/opt/sampledb3/data/sampledb.sqlite-wal`
- `/opt/sampledb3/data/sampledb.sqlite-shm`

These files are normal when SQLite is using WAL mode. Do not copy only `sampledb.sqlite` from a running application as a backup. Use the backup script for online backups. When restoring from restic, restore only the clean `sampledb.sqlite` file produced by the backup script and remove any stale `-wal` and `-shm` files before starting the app.

## Optional Migration to `/var/lib/sampledb3`

`/opt/sampledb3/data` works, but `/var/lib/sampledb3` is the more conventional Linux location for mutable application data. If you move the live database there, keep `/opt/sampledb3` for deployment files and scripts, and update both Docker Compose and the backup environment.

Recommended target layout:

- Application/deployment files: `/opt/sampledb3`
- Live database directory: `/var/lib/sampledb3`
- Live SQLite database file: `/var/lib/sampledb3/sampledb.sqlite`
- Backup environment file: `/etc/sampledb3/backup.env`
- Restic repository: `/opt/sampledb3/backups`

### 1. Run a Backup Before Migrating

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; /opt/sampledb3/ops/backup/backup-db-restic.sh'
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic snapshots --tag sampledb'
```

### 2. Stop SampleDB3

From the deployment directory:

```bash
cd /opt/sampledb3
sudo docker compose down
```

Do not migrate the database while the container is running.

### 3. Create the New Data Directory

```bash
sudo mkdir -p /var/lib/sampledb3
sudo chown root:root /var/lib/sampledb3
sudo chmod 700 /var/lib/sampledb3
```

### 4. Create a Clean Database Copy

Use SQLite's `.backup` command so any WAL contents are included in the new database file:

```bash
sudo sqlite3 /opt/sampledb3/data/sampledb.sqlite ".backup /var/lib/sampledb3/sampledb.sqlite"
sudo chown root:root /var/lib/sampledb3/sampledb.sqlite
sudo chmod 600 /var/lib/sampledb3/sampledb.sqlite
```

Do not manually copy only `/opt/sampledb3/data/sampledb.sqlite` if `sampledb.sqlite-wal` exists. The `.backup` command reads the database consistently and writes a clean single-file copy.

### 5. Preserve the Old Data Directory

Keep the old data until the migrated app has been tested:

```bash
sudo mv /opt/sampledb3/data /opt/sampledb3/data.before-var-migration-$(date +%Y%m%d-%H%M%S)
```

### 6. Update Docker Compose Configuration

Set the compose host data directory to `/var/lib/sampledb3`.

If you use a `.env` file next to `docker-compose.yml`, set:

```bash
HOST_DATA_DIR=/var/lib/sampledb3
```

The container-side database path can remain:

```bash
DATABASE_PATH=/data/sampledb.sqlite
```

### 7. Update `/etc/sampledb3/backup.env`

Change `DATABASE_PATH`:

```bash
DATABASE_PATH=/var/lib/sampledb3/sampledb.sqlite
RESTIC_REPOSITORY=local:/opt/sampledb3/backups
RESTIC_PASSWORD=replace-with-your-restic-password

RESTIC_TAG=sampledb
BACKUP_STDIN_FILENAME=sampledb.sqlite
RUN_RESTIC_FORGET=1
```

### 8. Start SampleDB3 and Verify

```bash
cd /opt/sampledb3
sudo docker compose up -d
sudo docker compose ps
sudo docker compose logs -n 100 sampledb3
```

Open the application and confirm the expected data is present.

### 9. Run a Post-Migration Backup

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; /opt/sampledb3/ops/backup/backup-db-restic.sh'
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic snapshots --tag sampledb'
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic check'
```

After the app and backups have worked for a while, remove the old preserved directory:

```bash
sudo rm -rf /opt/sampledb3/data.before-var-migration-YYYYMMDD-HHMMSS
```

## One-Time Setup

### 1. Install Required Packages

Install `sqlite3` and `restic` on the lab machine:

```bash
sudo apt update
sudo apt install sqlite3 restic
```

### 2. Create Directories

```bash
sudo mkdir -p /etc/sampledb3
sudo mkdir -p /opt/sampledb3/backups
sudo mkdir -p /opt/sampledb3/data
sudo mkdir -p /opt/sampledb3/ops/backup
```

If `/opt/sampledb3/backups` is a CIFS mount, make sure it is mounted before continuing.

### 3. Install the Backup Script

Copy the project backup script to the deployment location:

```bash
sudo cp ops/backup/backup-db-restic.sh /opt/sampledb3/ops/backup/backup-db-restic.sh
sudo chown root:root /opt/sampledb3/ops/backup/backup-db-restic.sh
sudo chmod 755 /opt/sampledb3/ops/backup/backup-db-restic.sh
```

### 4. Create `/etc/sampledb3/backup.env`

Create the root-only backup environment file:

```bash
sudo nano /etc/sampledb3/backup.env
```

Use this template:

```bash
DATABASE_PATH=/opt/sampledb3/data/sampledb.sqlite
RESTIC_REPOSITORY=local:/opt/sampledb3/backups
RESTIC_PASSWORD=replace-with-your-restic-password

RESTIC_TAG=sampledb
BACKUP_STDIN_FILENAME=sampledb.sqlite
RUN_RESTIC_FORGET=1
```

Lock down the file:

```bash
sudo chown root:root /etc/sampledb3/backup.env
sudo chmod 600 /etc/sampledb3/backup.env
```

### 5. Set Restic Repository Ownership

For this deployment, root owns and runs the backup system:

```bash
sudo chown -R root:root /opt/sampledb3/backups
sudo chmod -R u+rwX,go-rwx /opt/sampledb3/backups
```

If `/opt/sampledb3/backups` is a CIFS mount, ownership may be controlled by mount options instead. Configure the mount so root can read and write the repository, for example with `uid=0,gid=0,file_mode=0600,dir_mode=0700`.

### 6. Initialize Restic

Initialize the repository once:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic init'
```

Verify the repo can be opened:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic snapshots'
```

An empty snapshot list is fine at this stage.

## Manual Backup

Run a backup manually:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; /opt/sampledb3/ops/backup/backup-db-restic.sh'
```

Verify the snapshot exists:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic snapshots --tag sampledb'
```

Run an integrity check:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic check'
```

## Automated Backup With systemd

### 1. Create the Service

Create `/etc/systemd/system/sampledb3-backup.service`:

```bash
sudo nano /etc/systemd/system/sampledb3-backup.service
```

Use:

```ini
[Unit]
Description=SampleDB3 SQLite backup to restic
Wants=network-online.target
After=network-online.target
RequiresMountsFor=/opt/sampledb3/backups

[Service]
Type=oneshot
EnvironmentFile=/etc/sampledb3/backup.env
ExecStart=/opt/sampledb3/ops/backup/backup-db-restic.sh
```

`RequiresMountsFor=/opt/sampledb3/backups` is important when the restic repository is on a mounted CIFS share.

### 2. Create the Timer

Create `/etc/systemd/system/sampledb3-backup.timer`:

```bash
sudo nano /etc/systemd/system/sampledb3-backup.timer
```

Use:

```ini
[Unit]
Description=Run SampleDB3 backup daily

[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
Unit=sampledb3-backup.service

[Install]
WantedBy=timers.target
```

This runs the backup daily at 2:30 AM. `Persistent=true` means a missed backup runs after the machine boots.

### 3. Enable and Test

Reload systemd:

```bash
sudo systemctl daemon-reload
```

Run the service immediately:

```bash
sudo systemctl start sampledb3-backup.service
```

Check logs:

```bash
sudo journalctl -u sampledb3-backup.service -n 100 --no-pager
```

Enable the timer:

```bash
sudo systemctl enable --now sampledb3-backup.timer
```

Check the next scheduled run:

```bash
systemctl list-timers sampledb3-backup.timer
```

## Retention Policy

When `RUN_RESTIC_FORGET=1`, the backup script runs:

```bash
restic forget --tag sampledb --keep-daily 14 --keep-weekly 12 --keep-monthly 60 --prune
```

This keeps:

- 14 daily snapshots
- 12 weekly snapshots
- 60 monthly snapshots

`--prune` removes unreferenced repository data after old snapshots are forgotten.

## Restore the Latest Backup

Use this procedure when the live database must be replaced with a restic backup.

### 1. Stop SampleDB3

From the deployment directory:

```bash
cd /opt/sampledb3
sudo docker compose down
```

If the application is managed by a systemd service instead of manual Docker Compose commands, stop that service instead.

### 2. Restore to a Temporary Directory

Remove any old restore directory and restore the latest snapshot:

```bash
sudo rm -rf /tmp/sampledb3-restore
sudo mkdir -p /tmp/sampledb3-restore
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic restore latest --tag sampledb --target /tmp/sampledb3-restore'
```

The restored file should be:

```bash
/tmp/sampledb3-restore/sampledb.sqlite
```

If needed, locate it:

```bash
sudo find /tmp/sampledb3-restore -name sampledb.sqlite
```

### 3. Check the Restored Database

Run SQLite integrity check:

```bash
sudo sqlite3 /tmp/sampledb3-restore/sampledb.sqlite "PRAGMA integrity_check;"
```

The expected output is:

```text
ok
```

Do not replace the live database if this check fails.

### 4. Preserve the Current Live Database

Before replacing anything, save the current database:

```bash
restore_stamp=$(date +%Y%m%d-%H%M%S)
sudo mkdir -p "/opt/sampledb3/data/pre-restore-$restore_stamp"
sudo cp -a /opt/sampledb3/data/sampledb.sqlite* \
  "/opt/sampledb3/data/pre-restore-$restore_stamp/"
```

This preserves the main database plus any `sampledb.sqlite-wal` and `sampledb.sqlite-shm` files that were present before restore.

### 5. Install the Restored Database

```bash
sudo rm -f /opt/sampledb3/data/sampledb.sqlite
sudo rm -f /opt/sampledb3/data/sampledb.sqlite-wal
sudo rm -f /opt/sampledb3/data/sampledb.sqlite-shm
sudo cp /tmp/sampledb3-restore/sampledb.sqlite /opt/sampledb3/data/sampledb.sqlite
sudo chown root:root /opt/sampledb3/data/sampledb.sqlite
sudo chmod 600 /opt/sampledb3/data/sampledb.sqlite
```

The `-wal` and `-shm` files are deliberately removed here. The restored restic backup is a complete, clean SQLite database file, and SQLite will recreate sidecar files if it needs them after the app starts.

If the container runs as a non-root user in the future, adjust ownership so the container can read and write `/opt/sampledb3/data/sampledb.sqlite`.

### 6. Start SampleDB3

```bash
cd /opt/sampledb3
sudo docker compose up -d
```

Check status and logs:

```bash
sudo docker compose ps
sudo docker compose logs -n 100 sampledb3
```

Open the application and confirm the expected data is present.

## Restore a Specific Snapshot

List available snapshots:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic snapshots --tag sampledb'
```

Restore a chosen snapshot ID:

```bash
sudo rm -rf /tmp/sampledb3-restore
sudo mkdir -p /tmp/sampledb3-restore
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic restore SNAPSHOT_ID --target /tmp/sampledb3-restore'
```

Then continue with the same integrity check and replacement steps from the latest-backup restore procedure.

## Routine Maintenance

Run these checks periodically:

```bash
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic snapshots --tag sampledb'
sudo bash -c 'set -a; source /etc/sampledb3/backup.env; set +a; restic check'
sudo journalctl -u sampledb3-backup.service -n 100 --no-pager
```

At least quarterly, perform a restore drill to `/tmp/sampledb3-restore`, run `PRAGMA integrity_check;`, and verify that the restored database file exists and is readable.

