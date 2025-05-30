# WhatsApp Site Management Bot

A comprehensive WhatsApp bot for managing construction site operations, customer bookings, and employee activities using WhatsApp Business Cloud API, Supabase, and Express.js.

## 🚀 Features

### For Customers:
- **Site Visit Booking**: Schedule site visits with date/time selection
- **Availability Check**: View available time slots
- **Pricing Information**: Get pricing details for different projects
- **Sales Connection**: Connect with sales team directly

### For Employees:
- **OTP Verification**: Secure employee authentication
- **Activity Logging**: Log work hours and activities by site
- **Material Requests**: Request materials with urgency levels
- **Dashboard**: View personal statistics and pending requests

## 🛠️ Tech Stack

- **Backend**: Node.js with Express.js and TypeScript
- **Database**: Supabase (PostgreSQL) with Drizzle ORM
- **WhatsApp**: Meta WhatsApp Business Cloud API
- **Authentication**: OTP-based verification for employees

## 📋 Prerequisites

1. **WhatsApp Business Account**: 
   - Meta Business Manager account
   - WhatsApp Business Cloud API access
   - Phone number verification

2. **Supabase Account**:
   - Create a new project
   - Get project URL and service role key

3. **Node.js**: Version 18+ recommended

## ⚙️ Setup Instructions

### 1. Clone and Install Dependencies

```bash
cd site-bot
npm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# WhatsApp Business Cloud API
META_WHATSAPP_TOKEN=your_meta_access_token
META_PHONE_NUMBER_ID=your_phone_number_id
META_WEBHOOK_SECRET=your_webhook_verify_token

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres

# Security
JWT_SECRET=your_jwt_secret_key
OTP_EXPIRY_MINUTES=10
```

### 3. Database Setup

```bash
# Generate and push database migrations
npm run drizzle:generate
npm run drizzle:push
```

### 4. WhatsApp Business Setup

1. Go to [Meta Business Manager](https://business.facebook.com/)
2. Set up WhatsApp Business Cloud API
3. Configure webhook URL: `https://your-domain.com/webhook`
4. Set webhook verify token (same as META_WEBHOOK_SECRET)
5. Subscribe to `messages` webhook field

### 5. Running the Application

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 📱 Usage

### Customer Commands:
- `hi`, `hello`, `menu` - Show main menu
- `book`, `1` - Start booking process
- `availability`, `2` - Check available slots
- `pricing`, `3` - View pricing information
- `help` - Get help and support

### Employee Commands:
- Send 6-digit OTP for verification (first time)
- `menu` - Show employee menu
- `log`, `1` - Log work activity
- `materials`, `2` - Request materials
- `dashboard`, `3` - View personal dashboard

## 🗄️ Database Schema

The system uses the following main tables:

- **users**: Store user information (employees and customers)
- **employee_otps**: Temporary OTP storage for employee verification
- **sessions**: Conversation state management
- **bookings**: Customer site visit bookings
- **activities**: Employee work activity logs
- **material_requests**: Employee material requests
- **sites**: Project/site information
- **message_logs**: Audit trail of all messages

## 🔧 Development

### Project Structure

```
src/
├── db/                 # Database configuration and schema
│   ├── schema.ts      # Drizzle ORM schema definitions
│   └── index.ts       # Database connection setup
├── services/          # Business logic services
│   ├── flows/         # Conversation flow handlers
│   │   ├── customerFlow.ts
│   │   └── employeeFlow.ts
│   ├── messageHandler.ts  # Main message router
│   ├── userService.ts     # User management
│   └── whatsapp.ts        # WhatsApp API client
├── routes/            # Express.js routes
│   └── webhook.ts     # WhatsApp webhook handler
├── utils/             # Utility functions
│   ├── crypto.ts      # OTP generation and verification
│   └── phone.ts       # Phone number utilities
└── index.ts           # Main application entry point
```

### Adding New Features

1. **New Customer Flow**: Add methods to `CustomerFlow` class
2. **New Employee Flow**: Add methods to `EmployeeFlow` class
3. **Database Changes**: Update schema in `src/db/schema.ts` and run migrations
4. **New WhatsApp Templates**: Add to `WhatsAppService` class

### Useful Commands

```bash
# View database in browser (Drizzle Studio)
npm run drizzle:studio

# Compile TypeScript
npm run build

# Run development server with auto-reload
npm run dev
```

## 🚦 Deployment

### Heroku Deployment

1. Create a Heroku app
2. Set environment variables in Heroku dashboard
3. Deploy:

```bash
git add .
git commit -m "Initial deployment"
git push heroku main
```

### Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel`
3. Set environment variables in Vercel dashboard

## 🔐 Security Considerations

1. **Environment Variables**: Never commit `.env` file to git
2. **Webhook Verification**: Always verify webhook signatures
3. **OTP Security**: OTPs expire in 10 minutes with 3-attempt limit
4. **Database Access**: Use service role key securely
5. **Phone Number Validation**: Validate and normalize phone numbers

## 📞 Support

For support and questions:
- Email: support@yourcompany.com
- Phone: +91-XXXXXXXXXX

## 📄 License

This project is licensed under the ISC License. 