# WhatsApp Bot Service Management

This guide explains how to set up and manage the WhatsApp bot as a system service that automatically starts on server boot.

## Overview

The service setup consists of two systemd services:
- **whatsapp-bot.service**: The main Node.js application
- **zrok-tunnel.service**: The zrok tunnel for exposing the webhook endpoint

## Installation

### Prerequisites
- Node.js and npm installed
- zrok installed at `/usr/local/bin/zrok`
- User `bojrick` exists on the system
- Project located at `/home/bojrick/reeva-whatsapp-crm-erp/site-bot`

### Install Services

Run the installation script with sudo:

```bash
sudo ./install-services.sh
```

This will:
1. Copy service files to `/etc/systemd/system/`
2. Build the project
3. Enable services to start on boot
4. Start both services

## Managing Services

### View Service Status
```bash
# Check both services
systemctl status whatsapp-bot.service zrok-tunnel.service

# Check individual service
systemctl status whatsapp-bot.service
systemctl status zrok-tunnel.service
```

### View Logs
```bash
# Follow main application logs
journalctl -u whatsapp-bot.service -f

# Follow zrok tunnel logs
journalctl -u zrok-tunnel.service -f

# View last 100 lines
journalctl -u whatsapp-bot.service -n 100

# View logs from specific time
journalctl -u whatsapp-bot.service --since "2024-01-01 00:00:00"
```

### Start/Stop Services
```bash
# Start services
sudo systemctl start whatsapp-bot.service
sudo systemctl start zrok-tunnel.service

# Stop services
sudo systemctl stop whatsapp-bot.service
sudo systemctl stop zrok-tunnel.service

# Restart services
sudo systemctl restart whatsapp-bot.service
sudo systemctl restart zrok-tunnel.service
```

### Enable/Disable Auto-start
```bash
# Enable auto-start on boot
sudo systemctl enable whatsapp-bot.service
sudo systemctl enable zrok-tunnel.service

# Disable auto-start
sudo systemctl disable whatsapp-bot.service
sudo systemctl disable zrok-tunnel.service
```

## Configuration

### Environment Variables
The service reads environment variables from `/home/bojrick/reeva-whatsapp-crm-erp/site-bot/.env`

To update environment variables:
1. Edit the `.env` file
2. Restart the service: `sudo systemctl restart whatsapp-bot.service`

### Service Configuration
Service files are located at:
- `/etc/systemd/system/whatsapp-bot.service`
- `/etc/systemd/system/zrok-tunnel.service`

After modifying service files:
```bash
sudo systemctl daemon-reload
sudo systemctl restart whatsapp-bot.service
```

## Troubleshooting

### Service Won't Start
```bash
# Check detailed error messages
journalctl -u whatsapp-bot.service -xe

# Check if port is already in use
sudo lsof -i :3000

# Verify Node.js installation
which node
node --version
```

### zrok Tunnel Issues
```bash
# Check if zrok is installed
which zrok

# Verify zrok logs
journalctl -u zrok-tunnel.service -xe

# Manually test zrok
zrok share public 3000
```

### Permission Issues
Ensure the `bojrick` user has proper permissions:
```bash
# Check ownership
ls -la /home/bojrick/reeva-whatsapp-crm-erp/site-bot

# Fix permissions if needed
sudo chown -R bojrick:bojrick /home/bojrick/reeva-whatsapp-crm-erp/site-bot
```

## Uninstallation

To completely remove the services:

```bash
sudo ./uninstall-services.sh
```

This will:
1. Stop running services
2. Disable auto-start
3. Remove service files
4. Keep application files and logs intact

## Manual Service Setup

If you prefer to set up services manually:

1. Copy service files:
```bash
sudo cp whatsapp-bot.service /etc/systemd/system/
sudo cp zrok-tunnel.service /etc/systemd/system/
```

2. Reload systemd:
```bash
sudo systemctl daemon-reload
```

3. Enable and start:
```bash
sudo systemctl enable whatsapp-bot.service
sudo systemctl start whatsapp-bot.service
```

## Security Considerations

The services run with the following security settings:
- **User**: `bojrick` (non-root)
- **PrivateTmp**: Enabled (isolated /tmp directory)
- **NoNewPrivileges**: Enabled (prevents privilege escalation)
- **Memory Limit**: 1GB
- **File Descriptor Limit**: 65536

## Monitoring

### Health Checks
```bash
# Check if services are active
systemctl is-active whatsapp-bot.service

# Check failed units
systemctl list-units --failed
```

### Resource Usage
```bash
# Check memory usage
systemctl status whatsapp-bot.service | grep Memory

# Monitor in real-time
journalctl -u whatsapp-bot.service -f | grep -E "(Memory|CPU)"
```

## Backup Considerations

Before major updates:
1. Backup the `.env` file
2. Backup the database
3. Note the current zrok URL
4. Stop services during backup: `sudo systemctl stop whatsapp-bot.service` 