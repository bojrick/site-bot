#!/bin/bash

echo "🔧 Fixing WhatsApp Bot Issues"
echo "============================="

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cat > .env << 'EOF'
PORT=3011
NODE_ENV=development

# WhatsApp API - UPDATE THESE WITH YOUR REAL VALUES FROM META DEVELOPER CONSOLE
META_WHATSAPP_TOKEN=YOUR_NEW_ACCESS_TOKEN_HERE
META_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID_HERE
META_WEBHOOK_SECRET=qsefthuko

# Database - UPDATE WITH YOUR REAL DATABASE URL
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres

# Cloudflare R2 - UPDATE WITH YOUR REAL VALUES
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=reeva-erp
R2_PUBLIC_URL=https://pub-480de15262b346c8b5ebf5e8141b43f9.r2.dev

# Security
JWT_SECRET=your-jwt-secret-here
OTP_EXPIRY_MINUTES=10
EOF
    echo "✅ .env file created with template values"
    echo ""
fi

echo "🏗️ Populating database sites..."
npm run populate-sites

echo ""
echo "✅ Database sites populated successfully!"
echo ""
echo "🚨 IMPORTANT: You need to update these values in your .env file:"
echo "============================================================="
echo ""
echo "1. 📱 WhatsApp Token (EXPIRED - needs renewal):"
echo "   - Go to: https://developers.facebook.com/"
echo "   - Select your app > WhatsApp > API Setup"
echo "   - Copy the new Access Token"
echo "   - Update META_WHATSAPP_TOKEN in .env"
echo ""
echo "2. 📞 Phone Number ID:"
echo "   - Copy from WhatsApp API Setup page"
echo "   - Update META_PHONE_NUMBER_ID in .env"
echo ""
echo "3. 🗄️ Database URL:"
echo "   - Update SUPABASE_DB_URL with your real database connection"
echo ""
echo "4. ☁️ Cloudflare R2 (if using file uploads):"
echo "   - Update R2_* variables with your Cloudflare R2 credentials"
echo ""
echo "After updating .env, restart the bot with:"
echo "npm run dev"
echo ""
echo "🔍 Test your token with:"
echo "node test-token.js" 