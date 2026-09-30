#!/usr/bin/env bash
set -euo pipefail

if [ "${EUID}" -ne 0 ]; then
  echo "Run this script as root: sudo ./provision.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo "Updating Ubuntu packages..."
apt-get update
apt-get install -y ca-certificates curl gnupg ufw unattended-upgrades

echo "Installing Docker Engine..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

echo "Configuring Docker log rotation..."
cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "5"
  }
}
JSON
systemctl restart docker

echo "Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw limit OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "Enabling automatic security updates..."
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "Creating deployment directories..."
install -d -m 0755 /opt/vendero
install -d -m 0700 /opt/vendero/secrets

echo
echo "IONOS VPS provisioning complete."
echo "Next: copy deploy/ionos into /opt/vendero, populate .env and secrets, then run ./deploy.sh."
