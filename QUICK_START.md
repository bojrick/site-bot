# 🚀 Quick Start - Get Your WhatsApp Bot Working in 5 Minutes

## Step 1: Set Up Ngrok (One-time setup)

### 1.1 Create Ngrok Account
1. Go to https://dashboard.ngrok.com/signup
2. Sign up for a free account

### 1.2 Get Your Auth Token
1. After signup, go to https://dashboard.ngrok.com/get-started/your-authtoken
2. Copy your auth token

### 1.3 Configure Ngrok
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

## Step 2: Start Your Development Environment

### 2.1 Method 1: Automated (Recommended)
```bash
./start-dev.sh
```

### 2.2 Method 2: Manual
```bash
# Terminal 1: Start the server
npm run dev

# Terminal 2: Start ngrok tunnel
ngrok http 3000
```

## Step 3: Get Your Webhook URL

After ngrok starts, you'll see:
```
Forwarding    https://abc123.ngrok.io -> http://localhost:3000
```

**Your webhook URL is:** `https://abc123.ngrok.io/webhook`

## Step 4: Configure Meta Developer Console

### 4.1 Go to Meta Developers
Visit: https://developers.facebook.com/

### 4.2 Set Up WhatsApp Business
1. Create/select your app
2. Add WhatsApp Business product
3. Go to **WhatsApp > Configuration**

### 4.3 Configure Webhook
1. **Webhook URL**: `https://your-ngrok-url.ngrok.io/webhook`
2. **Verify Token**: `test_webhook_secret` (or any string)
3. Subscribe to **messages** field
4. Click **Verify and Save**

### 4.4 Get Your Credentials
1. Copy your **Access Token**
2. Copy your **Phone Number ID**

## Step 5: Update Environment Variables

Create `.env` file:
```env
PORT=3000
NODE_ENV=development

# Update these with your real values from Meta
META_WHATSAPP_TOKEN=your_access_token_from_meta
META_PHONE_NUMBER_ID=your_phone_number_id_from_meta
META_WEBHOOK_SECRET=test_webhook_secret

# Keep these as test values for now
SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_KEY=test_service_key
SUPABASE_DB_URL=postgresql://test:test@localhost:5432/test
JWT_SECRET=test_jwt_secret
OTP_EXPIRY_MINUTES=10
```

## Step 6: Test Your Bot

### 6.1 Restart Server (if you updated .env)
```bash
# Stop the server (Ctrl+C) and restart
npm run dev
```

### 6.2 Send Test Message
Send any message to your WhatsApp Business number. You should see:
- Server logs showing the incoming webhook
- WhatsApp responds with the customer menu

## 🎉 Success!

Your WhatsApp bot is now working! You can:
- ✅ Receive messages from WhatsApp
- ✅ Send responses back to users
- ✅ Test customer booking flows
- ⚠️  Employee flows need database setup

## 🔄 Next Steps

1. **Add Database**: Set up Supabase for full functionality
2. **Test All Flows**: Try booking, employee verification, etc.
3. **Deploy to Production**: Move from ngrok to real hosting

## 🛠️ Troubleshooting

### Webhook Verification Failed?
- Check your webhook URL is correct
- Ensure WEBHOOK_SECRET matches what you entered in Meta
- Check server logs for verification requests

### No Response to Messages?
- Verify your ACCESS_TOKEN and PHONE_NUMBER_ID
- Check server logs for errors
- Ensure ngrok is running and accessible

### Need Help?
- Check the full `DEVELOPMENT_SETUP.md` for detailed instructions
- View ngrok requests at http://localhost:4040
- Check server logs for error messages 