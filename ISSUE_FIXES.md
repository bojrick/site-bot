# 🔧 WhatsApp Bot Issue Fixes

## Issues Identified

### 1. 🚨 WhatsApp Access Token Expired (401 Unauthorized)

**Error:** `Error validating access token: Session has expired on Tuesday, 10-Jun-25 01:00:00 PDT`

**Cause:** WhatsApp access tokens have expiration dates and need to be renewed periodically.

### 2. 🗄️ Database UUID Error

**Error:** `invalid input syntax for type uuid: "site_1"`

**Cause:** The employee flow was trying to insert string values like "site_1" into UUID database columns.

## ✅ Solutions Implemented

### Fix 1: Database Sites Population

**Status:** ✅ COMPLETED

The database has been populated with the required sites that map to the UUIDs expected by the employee flow:

```
site_1: 11111111-1111-1111-1111-111111111111
site_2: 22222222-2222-2222-2222-222222222222  
site_3: 33333333-3333-3333-3333-333333333333
```

The `EmployeeFlow.getSiteUUID()` method now correctly maps display IDs to database UUIDs.

### Fix 2: WhatsApp Token Configuration

**Status:** ⚠️ REQUIRES MANUAL UPDATE

## 🚀 Quick Fix Instructions

### Option 1: Run the Auto-Fix Script

```bash
./fix-issues.sh
```

This script will:
- ✅ Create a `.env` file with template values
- ✅ Populate database sites automatically
- ℹ️ Show you what needs to be updated manually

### Option 2: Manual Steps

#### Step 1: Create Environment File

Create a `.env` file in the root directory:

```env
PORT=3011
NODE_ENV=development

# WhatsApp API - UPDATE THESE VALUES
META_WHATSAPP_TOKEN=YOUR_NEW_ACCESS_TOKEN_HERE
META_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID_HERE
META_WEBHOOK_SECRET=qsefthuko

# Database - UPDATE WITH YOUR VALUES
SUPABASE_DB_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres

# Other required variables...
```

#### Step 2: Get New WhatsApp Token

1. Go to [Meta Developers Console](https://developers.facebook.com/)
2. Select your WhatsApp Business app
3. Navigate to **WhatsApp > API Setup**
4. Copy the new **Access Token**
5. Copy the **Phone Number ID**
6. Update these in your `.env` file:
   ```env
   META_WHATSAPP_TOKEN=EAAXbuPuiqWsBO6dZCtC...  # Your new token
   META_PHONE_NUMBER_ID=596092260264515         # Your phone ID
   ```

#### Step 3: Populate Database Sites

```bash
npm run populate-sites
```

#### Step 4: Test Your Setup

```bash
# Test the token
node test-token.js

# Test sending a message
node test-send.js
```

#### Step 5: Restart the Bot

```bash
npm run dev
```

## 🔍 Verification

### Database Sites Check

```bash
npm run test-activity
```

Should show:
```
✅ Activity logged successfully!
📋 Activity ID: xxxxxxxx
🏗️ Site: સાઈટ A - રહેઠાણ
```

### WhatsApp Token Check

```bash
node test-token.js
```

Should show:
```
✅ Token is valid!
📞 Phone Number Info: { ... }
```

### Bot Functionality Check

Send "Hi" to your WhatsApp bot. It should respond with:
```
🏗️ Welcome to our Site Management Service!

How can I help you today?
[📅 Book Site Visit] [🕐 Check Availability] [💰 Pricing & Plans]
```

## 🚨 Common Issues & Solutions

### Issue: Token Still Invalid After Update

**Solution:**
1. Make sure there are no extra spaces in the token
2. Verify the token is copied completely
3. Check that your Meta app has WhatsApp Business API enabled
4. Ensure your phone number is verified in Meta Business

### Issue: Database Connection Failed

**Solution:**
1. Verify your database URL is correct
2. Check database credentials
3. Ensure the database is accessible from your server

### Issue: Sites Not Found

**Solution:**
```bash
# Re-run the sites population
npm run populate-sites
```

## 📞 Support

If you continue to have issues:

1. **Check logs:** Look at `server.log` for detailed error messages
2. **Environment check:** Run `npm run dev` and check the initialization logs
3. **Database check:** Verify your database connection and schema
4. **Token check:** Use `node test-token.js` to verify WhatsApp API access

## 📝 Notes

- WhatsApp tokens typically expire every 60 days
- Set up a monitoring system to alert you before token expiration
- Keep backup tokens if your app supports multiple access tokens
- Consider implementing token refresh logic for production apps 