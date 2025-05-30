#!/bin/bash

# Exit on error
set -e

echo "🚀 Installing WhatsApp Bot Services"
echo "=================================="

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run this script with sudo"
    exit 1
fi

# Check if services already exist
if systemctl list-unit-files | grep -q "whatsapp-bot.service"; then
    echo "⚠️  Service already exists. Stopping existing services..."
    systemctl stop whatsapp-bot.service || true
    systemctl stop zrok-tunnel.service || true
fi

# Copy service files to systemd directory
echo "📁 Copying service files..."
cp whatsapp-bot.service /etc/systemd/system/
cp zrok-tunnel.service /etc/systemd/system/

# Reload systemd daemon
echo "🔄 Reloading systemd daemon..."
systemctl daemon-reload

# Enable services to start on boot
echo "✅ Enabling services..."
systemctl enable whatsapp-bot.service
systemctl enable zrok-tunnel.service

# Build the project first
echo "🔨 Building the project..."
su -c "cd /home/bojrick/reeva-whatsapp-crm-erp/site-bot && npm install && npm run build" bojrick

# Start services
echo "🚀 Starting services..."
systemctl start whatsapp-bot.service

# Wait a bit before starting zrok
sleep 5
systemctl start zrok-tunnel.service

# Show status
echo ""
echo "📊 Service Status:"
echo "=================="
systemctl status whatsapp-bot.service --no-pager
echo ""
systemctl status zrok-tunnel.service --no-pager

echo ""
echo "✅ Installation complete!"
echo ""
echo "Useful commands:"
echo "  - View logs: journalctl -u whatsapp-bot.service -f"
echo "  - View zrok logs: journalctl -u zrok-tunnel.service -f"
echo "  - Restart services: systemctl restart whatsapp-bot.service zrok-tunnel.service"
echo "  - Stop services: systemctl stop whatsapp-bot.service zrok-tunnel.service"
echo "  - Check status: systemctl status whatsapp-bot.service zrok-tunnel.service" 