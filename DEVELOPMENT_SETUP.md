# 🚀 Development Setup Guide

## Quick Start

### Option 1: Automated Setup (Recommended)
```bash
# Run the automated development setup
./start-dev.sh
```

This will:
1. Create a `.env` file with test values if it doesn't exist
2. Start the development server
3. Start ngrok tunnel and display your public webhook URL

### Option 2: Manual Setup

#### 1. Start the Development Server
```bash
npm run dev
```

#### 2. In a New Terminal, Start Ngrok
```bash
# Open new terminal and navigate to project
cd site-bot

# Start ngrok tunnel
ngrok http 3000
```

## 🌐 Setting Up Your Webhook URL

After running ngrok, you'll see output like this:
```
Session Status                online
Account                       your-account (Plan: Free)
Version                       3.x.x
Region                        United States (us)
Latency                       -
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123.ngrok.io -> http://localhost:3000
```

**Your webhook URL is:** `https://abc123.ngrok.io/webhook`

## 📱 Configure WhatsApp Business API

### 1. Go to Meta Developers Console
Visit: https://developers.facebook.com/

### 2. Create/Select Your App
- Create a new app or select existing
- Add WhatsApp Business product

### 3. Configure Webhook
1. Go to **WhatsApp > Configuration**
2. Set **Webhook URL**: `https://your-ngrok-url.ngrok.io/webhook`
3. Set **Verify Token**: Use any string (e.g., `my_webhook_secret`)
4. Subscribe to **messages** field
5. Click **Verify and Save**

### 4. Update Your Environment Variables
Create/update `.env` file with real values:
```env
# WhatsApp Business Cloud API
META_WHATSAPP_TOKEN=your_actual_token_from_meta
META_PHONE_NUMBER_ID=your_phone_number_id_from_meta
META_WEBHOOK_SECRET=my_webhook_secret

# Keep other test values for now
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_KEY=test_service_key
SUPABASE_DB_URL=postgresql://test:test@localhost:5432/test
JWT_SECRET=test_jwt_secret
OTP_EXPIRY_MINUTES=10
```

### 5. Test Your Webhook
1. Send a message to your WhatsApp Business number
2. Check the server logs for incoming webhook calls
3. The server should respond with "OK" to Meta

## 🗄️ Database Setup (Optional for Initial Testing)

### Without Database
- Server will run but show: "⚠️ Database not connected"
- Webhook verification will work
- Message logging and user management won't work

### With Supabase Database
1. **Create Supabase Project**
   - Go to https://supabase.com
   - Create new project
   - Note your project URL and service key

2. **Update Environment**
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_KEY=your_service_role_key
   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres
   ```

3. **Run Database Migrations**
   ```bash
   npm run drizzle:push
   ```

## 🧪 Testing

### 1. Health Check
```bash
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"...","service":"WhatsApp Site Bot"}
```

### 2. Webhook Verification
Meta will send a GET request to verify your webhook. Check logs for:
```
🔐 Webhook verification request: { mode: 'subscribe', token: 'your_token' }
✅ Webhook verified successfully
```

### 3. Test Message Flow
Send messages to your WhatsApp Business number:
- **Customer**: Gets main menu with booking options
- **Employee**: First needs to verify with OTP

## 🛠️ Troubleshooting

### Common Issues

1. **ngrok URL Changes**
   - Free ngrok URLs change every restart
   - Update webhook URL in Meta console each time
   - Consider ngrok paid plan for fixed URLs

2. **Database Connection Errors**
   - Server will still work for webhook verification
   - User flows won't work without database
   - Set up Supabase for full functionality

3. **WhatsApp Webhook Verification Fails**
   - Check your WEBHOOK_SECRET matches Meta console
   - Ensure ngrok URL is correct in Meta console
   - Check server logs for verification requests

### Useful Commands

```bash
# View ngrok web interface (tunnels and requests)
http://localhost:4040

# Check running processes
ps aux | grep node
ps aux | grep ngrok

# Kill background processes
pkill -f "ts-node"
pkill -f "ngrok"

# Restart everything
npm run dev &
ngrok http 3000
```

## 📝 Development Workflow

1. **Start development environment**
   ```bash
   ./start-dev.sh
   ```

2. **Update webhook URL in Meta console** (if ngrok URL changed)

3. **Test with WhatsApp messages**

4. **Check logs** for debugging

5. **Update code** and server will auto-reload

6. **Before production**: Set up proper database and deploy to cloud

## 🚀 Next Steps

1. ✅ Get webhook working with test values
2. ✅ Test message flows without database
3. 🔄 Set up Supabase database for full functionality
4. 🔄 Deploy to production (Heroku, Vercel, etc.)
5. 🔄 Set up proper domain instead of ngrok 