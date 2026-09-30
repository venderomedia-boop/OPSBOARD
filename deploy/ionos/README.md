# IONOS VPS production deployment

This folder contains the cloud-primary deployment for the field-service application.

## Target server

- Ubuntu 24.04 LTS
- 8 vCPU / 16 GB RAM recommended
- 250 GB+ NVMe; 480 GB is a good starting point
- Public IPv4
- Root/SSH access
- Ports 80 and 443 open inbound
- Docker Engine + Docker Compose plugin

## Services

- `dispatchboard`: customer-facing office application and Phase 1 email endpoints
- `engineer`: installable engineer web application with offline shell caching and device-side sync queue
- `opsboard`: shared workflow/API service. Its Phase 2 UI does not need to be linked or promoted
- `postgres`: authoritative workflow state and application user/authentication records
- `caddy`: HTTPS termination and same-origin routing for separate office and engineer domains
- `backup`: encrypted Restic backups to the client's physical server

Persistent data lives in Docker named volumes and is never stored only inside a container.

## Data layout

The production stack deliberately separates operational data by responsibility:

- PostgreSQL: shared jobs, assignments, job events, media metadata, offline replay/idempotency state, and application users/authentication.
- OPSBOARD persistent volume: compliance SQLite database, timesheets, invoice queue, email-intake records, generated exports and uploaded job media.
- Dispatch Board persistent volume: Phase 1 email-intake/runtime state used by the office application.
- Engineer devices: encrypted/secure authentication session plus a local offline cache/outbox for assigned work.

All server-side stores are included in the encrypted backup process. PostgreSQL is backed up using a consistent `pg_dump`; the persistent application volumes are backed up separately by Restic.

## First deployment

1. Point both the office and engineer DNS names at the VPS public IPv4.
2. On a fresh Ubuntu 24.04 VPS, run `sudo bash provision.sh` to install Docker, configure UFW and enable unattended security updates.
3. Copy this directory to `/opt/vendero`.
4. Copy `.env.example` to `.env` and fill in the production values, including strong PostgreSQL, bootstrap-admin and token-signing secrets. Pin `OPSBOARD_TAG`, `DISPATCHBOARD_TAG` and `ENGINEER_TAG` to the exact tested Git-SHA image tags for the release; avoid `latest` for normal production releases. `OPSBOARD_TAG`, `DISPATCHBOARD_TAG` and `ENGINEER_TAG` can each be pinned to their own tested image SHA.
5. Create `secrets/restic_password` with a long random backup password.
6. Create an SSH keypair dedicated to backup transfer and place the private key at `secrets/id_ed25519`.
7. Add the physical backup server's SSH host key to `secrets/known_hosts`.
8. On the physical server, create a restricted backup account and `/srv/vendero/restic`.
9. Authenticate Docker to GHCR if the container packages are private.
10. Run `sudo bash deploy.sh`. The script validates the Compose file, pulls the pinned app images, builds the backup worker and checks container health.
11. Check `docker compose ps`, confirm the backend database health, sign in to the office domain, and verify the engineer domain can install/cache its offline shell.

## Firewall

Expose only 80/tcp and 443/tcp+udp publicly. Do not expose the application container ports or data volumes directly.

SSH should be restricted to approved admin IPs or a VPN where possible.

## Physical-server backups

The backup container uses Restic encryption before data leaves the VPS. The preferred path is:

`IONOS VPS -> WireGuard/Tailscale -> client physical server -> Restic repository`

The physical server therefore receives encrypted, versioned snapshots rather than a fragile two-way file sync.

Default retention:

- 30 daily snapshots
- 8 weekly snapshots
- 12 monthly snapshots

Default backup interval is six hours and can be changed with `BACKUP_INTERVAL_SECONDS`.

## Restore testing

A backup is not accepted as complete until a restore has been tested. Run a scheduled restore test at least monthly and before major application upgrades.

## Production acceptance

Before cutover:

- Create named accounts for every office user and engineer.
- Ensure each engineer application user ID matches their workflow technician ID.
- Verify office and engineer HTTPS certificates.
- Complete the airplane-mode field acceptance test.
- Verify the pending sync count returns to zero after reconnection.
- Verify replayed events, raised jobs and timesheets are created exactly once.
- Run a Restic backup and restore test, including the PostgreSQL dump.
- Record the recovery procedure and backup-server credentials in the client handover pack.


### Application rollback

Every production image is also tagged with its Git commit SHA. If an application release needs to be rolled back without touching PostgreSQL or persistent volumes:

`sudo bash rollback.sh <opsboard|dispatchboard|engineer> <known-good-image-tag>`

The rollback script changes only the selected application's image tag and restarts that container. PostgreSQL, persistent application volumes, the other applications and backup data are retained.
