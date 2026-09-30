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
- `opsboard`: shared workflow/API service. Its Phase 2 UI does not need to be linked or promoted.
- `caddy`: HTTPS termination and same-origin routing
- `backup`: encrypted Restic backups to the client's physical server

Persistent data lives in Docker named volumes and is never stored only inside a container.

## First deployment

1. Point the chosen DNS name at the VPS public IPv4.
2. Install Docker and the Compose plugin.
3. Copy this directory to `/opt/vendero`.
4. Copy `.env.example` to `.env` and fill in the production values.
5. Create `secrets/restic_password` with a long random backup password.
6. Create an SSH keypair dedicated to backup transfer and place the private key at `secrets/id_ed25519`.
7. Add the physical backup server's SSH host key to `secrets/known_hosts`.
8. On the physical server, create a restricted backup account and `/srv/vendero/restic`.
9. Authenticate Docker to GHCR if the container packages are private.
10. Run `docker compose pull && docker compose up -d`.
11. Check `docker compose ps` and `https://<domain>/health` through the appropriate internal health endpoints/logs.

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

## Important production note

The current application repositories still contain some file-backed persistence inherited from the MVP. The Docker volumes in this stack make that data durable on the VPS and back it up safely. Migration of the operational records to PostgreSQL should be completed before final production cutover if PostgreSQL is the agreed system-of-record architecture.
