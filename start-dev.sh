#!/bin/bash

echo "🚀 Starting WhatsApp Bot Development Environment"
echo "=============================================="

# Check if .env exists, if not copy from example
if [ ! -f .env ]; then
    echo "📝 Creating .env file with test values..."
    cat > .env << EOF
PORT=3000
NODE_ENV=development
META_WHATSAPP_TOKEN=test_token
META_PHONE_NUMBER_ID=test_phone_id
META_WEBHOOK_SECRET=test_webhook_secret
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_KEY=test_service_key
SUPABASE_DB_URL=postgresql://test:test@localhost:5432/test
JWT_SECRET=test_jwt_secret
OTP_EXPIRY_MINUTES=10
EOF
    echo "✅ .env file created with test values"
    echo "⚠️  Remember to update with your real credentials!"
fi

echo ""
echo "🛠️  Starting development server..."
npm run dev &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo ""
echo "🌐 Starting zrok tunnel..."
echo "📱 Your webhook URL will be displayed below:"
echo ""

# Start ngrok
zrok share public 3011