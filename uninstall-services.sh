#!/bin/bash

echo "🛑 Uninstalling WhatsApp Bot Services"
echo "===================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run this script with sudo"
    exit 1
fi

# Stop services
echo "🛑 Stopping services..."
systemctl stop whatsapp-bot.service 2>/dev/null || true
systemctl stop zrok-tunnel.service 2>/dev/null || true

# Disable services
echo "🚫 Disabling services..."
systemctl disable whatsapp-bot.service 2>/dev/null || true
systemctl disable zrok-tunnel.service 2>/dev/null || true

# Remove service files
echo "🗑️  Removing service files..."
rm -f /etc/systemd/system/whatsapp-bot.service
rm -f /etc/systemd/system/zrok-tunnel.service

# Reload systemd daemon
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

echo ""
echo "✅ Services uninstalled successfully!"
echo "Note: Application files and logs remain in /home/bojrick/reeva-whatsapp-crm-erp/site-bot" 