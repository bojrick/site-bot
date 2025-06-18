# 📨 Introduction Message System

This system automatically sends welcome messages to new employees when they are added to the Supabase database, helping them understand how to use the employee portal.

## ✨ Features

- **Automatic Messaging**: New employees automatically receive introduction messages via WhatsApp
- **Message Tracking**: Database tracks whether introduction messages have been sent
- **Duplicate Prevention**: Prevents sending multiple introduction messages to the same employee
- **Manual Management**: Admin endpoints to manually send or resend messages
- **Bulk Processing**: Send introduction messages to all pending employees at once
- **Gujarati Language**: Messages are in Gujarati to match the employee flow language

## 🗄️ Database Changes

### New Columns Added to `users` Table:
- `introduction_sent` (boolean): Tracks if introduction message was sent
- `introduction_sent_at` (timestamp): When the introduction message was sent

## 🔄 Automatic Workflow

When a new employee is added through the `EmployeeService`:
1. Employee is created/converted in the database
2. Introduction message is automatically sent (asynchronously)
3. Database is updated to mark message as sent
4. Process continues without blocking the main operation

## 📋 Introduction Message Content

The introduction message includes:
- Welcome message in Gujarati
- Explanation of portal features (activity logging, material requests, invoice tracking)
- Step-by-step getting started instructions
- Contact information for support
- Company branding (Suvasam Group)

## 🛠️ Manual Management

### API Endpoints

#### Send Introduction to Specific Employee
```bash
POST /admin/employees/{phone}/introduction
```

#### Send to All Pending Employees
```bash
POST /admin/employees/introduction/send-pending
```
Response includes count of sent/failed messages.

#### Check Introduction Status
```bash
GET /admin/employees/{phone}/introduction
```

#### Reset Introduction Status (for testing)
```bash
DELETE /admin/employees/{phone}/introduction
```

#### List All Employees (with introduction status)
```bash
GET /admin/employees
```
Now includes `introduction_sent` and `introduction_sent_at` fields.

### CLI Commands

#### Send Introduction Messages to All Pending Employees
```bash
npm run send-introductions
```

This command:
1. Connects to the database
2. Finds all employees without introduction messages
3. Sends WhatsApp messages
4. Updates database with delivery status
5. Provides summary report

#### Get Help
```bash
npm run send-introductions -- --help
```

## 🔧 Configuration

### Required Environment Variables
- `SUPABASE_DB_URL`: Database connection string
- `WHATSAPP_ACCESS_TOKEN`: WhatsApp Business API token
- `WHATSAPP_PHONE_NUMBER_ID`: WhatsApp phone number ID

### Message Customization
To modify the introduction message content, edit the `getIntroductionMessage()` method in:
```
src/services/introductionService.ts
```

## 📊 Usage Examples

### Add Employee (Automatic Introduction)
```bash
curl -X POST http://localhost:3000/admin/employees \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "919876543210",
    "name": "કર્મચારી નામ",
    "email": "employee@example.com"
  }'
```
Introduction message sent automatically!

### Manual Introduction Send
```bash
curl -X POST http://localhost:3000/admin/employees/919876543210/introduction
```

### Bulk Send Pending Introductions
```bash
curl -X POST http://localhost:3000/admin/employees/introduction/send-pending
```

### Check Status
```bash
curl http://localhost:3000/admin/employees/919876543210/introduction
```

## 🚀 Deployment Considerations

### Rate Limiting
- Messages are sent with 1-second delays between each
- Prevents WhatsApp API rate limiting
- Safe for bulk operations

### Error Handling
- Failed messages are logged
- Database remains consistent even if WhatsApp sending fails
- Retry mechanism available through manual endpoints

### Monitoring
- All introduction activities are logged to console
- Database tracks exact delivery timestamps
- Admin endpoints provide status visibility

## 🔍 Troubleshooting

### Introduction Message Not Sent
1. Check WhatsApp API credentials
2. Verify employee phone number format
3. Check console logs for error messages
4. Use manual send endpoint to retry

### Duplicate Messages
- System prevents duplicates automatically
- Reset status if testing needed
- Check `introduction_sent` field in database

### Database Migration Issues
If adding to existing system:
```bash
npm run drizzle:generate
npm run drizzle:push
```

## 🎯 Testing

### Test Introduction Flow
1. Add a test employee:
```bash
curl -X POST http://localhost:3000/admin/employees \
  -H "Content-Type: application/json" \
  -d '{"phone": "YOUR_TEST_PHONE", "name": "Test Employee"}'
```

2. Check if message was sent:
```bash
curl http://localhost:3000/admin/employees/YOUR_TEST_PHONE/introduction
```

3. Reset for re-testing:
```bash
curl -X DELETE http://localhost:3000/admin/employees/YOUR_TEST_PHONE/introduction
```

## 🔐 Security Notes

- Introduction messages contain no sensitive information
- Phone numbers are validated and normalized
- Only employees receive introduction messages
- Admin endpoints should be secured in production

## 📈 Future Enhancements

Potential improvements:
- Message templates for different employee types
- Scheduled reminder messages
- Read receipt tracking
- Multi-language support
- Message customization per site/project 