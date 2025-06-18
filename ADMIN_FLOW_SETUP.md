# Admin Flow Setup and Usage Guide

## Overview

The Admin Flow provides a comprehensive testing and management interface for WhatsApp bot administrators. It allows admins to test both customer and employee flows, view system statistics, and manage the bot's functionality.

## Features

### 🔧 Admin Control Panel
- Test Customer Flow - Full access to customer features (booking, pricing, availability)
- Test Employee Flow - Full access to employee features (activity logging, material requests)
- Admin Dashboard - System statistics and user metrics
- Session Management - Reset and manage conversation states

### 🧪 Flow Testing
- **Customer Flow Testing**: Test all customer features including site visit booking, pricing inquiries, and sales connections
- **Employee Flow Testing**: Test employee features with auto-verification (bypasses OTP requirement)
- **Seamless Switching**: Easy exit from test modes back to admin panel

### 📊 Admin Dashboard
- Total user count and verification status
- User breakdown by role (customers, employees, admins)
- Active session monitoring
- System health checks

## Setup Instructions

### 1. Database Schema Update
The admin role has been added to the database schema. Run the migration:

```bash
# Generate migration
npx drizzle-kit generate:pg

# Apply migration
npx drizzle-kit push:pg
```

### 2. Create Admin User
Use the provided script to create an admin user:

```bash
# Create admin with default phone number
npm run create-admin

# Create admin with specific phone number and name
npm run create-admin "+1234567890" "John Admin"

# Or use ts-node directly
npx ts-node scripts/create-admin-user.ts "+1234567890" "John Admin"
```

### 3. Environment Variables
Add your admin phone number to `.env` (optional):

```env
ADMIN_PHONE=+1234567890
ADMIN_NAME=Your Admin Name
```

## Admin Commands

### Main Commands
- `admin` or `menu` - Show admin control panel
- `help` - Display admin help and commands
- `dashboard` - View system dashboard
- `reset` - Reset current session

### Flow Testing Commands
- `test_customer` or `1` - Start customer flow testing
- `test_employee` or `2` - Start employee flow testing
- `exit` - Exit test mode and return to admin panel

### Quick Commands
- `customer` - Quick start customer flow test
- `employee` - Quick start employee flow test

## Usage Guide

### 1. Accessing Admin Panel
Send any message from your admin phone number to the WhatsApp bot. Type `admin` or `menu` to access the admin panel.

### 2. Testing Customer Flow
1. Select "Test Customer Flow" or type `test_customer`
2. All customer features are available:
   - Site visit booking
   - Availability checking
   - Pricing information
   - Sales connection
3. Type `exit` to return to admin panel

### 3. Testing Employee Flow
1. Select "Test Employee Flow" or type `test_employee`
2. All employee features are available:
   - Activity logging with photo upload
   - Material requests
   - Dashboard viewing
   - Gujarati language support
3. OTP verification is automatically bypassed for admins
4. Type `exit` to return to admin panel

### 4. Admin Dashboard
- View total users, active users, and sessions
- See user breakdown by role
- Monitor system health
- Quick access to testing functions

## Technical Implementation

### Files Modified
- `src/db/schema.ts` - Added admin role to user schema
- `src/services/flows/adminFlow.ts` - New admin flow implementation
- `src/services/messageHandler.ts` - Admin routing logic
- `scripts/create-admin-user.ts` - Admin user creation script

### Flow Architecture
- **AdminFlow Class**: Manages admin interface and flow testing
- **Session Management**: Maintains separate states for test flows
- **Mock Users**: Creates temporary user objects for flow testing
- **State Isolation**: Test flows don't interfere with admin session
- **Wrapper Classes**: CustomerFlowWrapper and EmployeeFlowWrapper intercept session calls
- **Session Interception**: Prevents test flows from overwriting admin session in database

### Session Management Architecture
The AdminFlow implements a sophisticated session management system:

1. **Wrapper Classes**: 
   - `CustomerFlowWrapper` and `EmployeeFlowWrapper` extend the original flow classes
   - Override `updateSession()` and `clearSession()` methods to prevent database writes
   - Capture session state changes in memory instead of database

2. **State Isolation**:
   - Admin session maintains `test_customer` or `test_employee` intent
   - Nested session states stored in admin session data:
     - `customer_intent`, `customer_step`, `customer_data`
     - `employee_intent`, `employee_step`, `employee_data`

3. **Session Persistence**:
   - Test flow states persist across messages within admin session
   - Each phone number gets its own wrapper instances
   - State changes are captured and stored in admin session structure

### Error Handling
- Custom error messages for admin users
- Graceful fallback to admin panel on errors
- Database connection monitoring

## Security Considerations

### Admin User Verification
- Admin users are automatically verified (no OTP required)
- Phone number-based admin identification
- Session isolation between test modes

### Data Safety
- Test flows use mock user objects
- No permanent data changes during testing
- Session states are properly managed and cleaned

## Troubleshooting

### Common Issues

1. **Admin panel not showing**
   - Verify admin user exists in database
   - Check phone number format matches exactly
   - Confirm user role is set to 'admin'

2. **Test flows not working**
   - Check database connection
   - Verify flow classes are properly imported
   - Review logs for error messages

3. **Session conflicts or flow restarts**
   - The AdminFlow uses wrapper classes to prevent session conflicts
   - Test flows are isolated from the admin session using session interception
   - If flows still restart, check console logs for wrapper intercepted messages
   - Use reset command to clear session if needed

4. **Flow state not persisting between steps**
   - AdminFlow now properly maintains nested session states
   - Each test flow's state is captured and preserved in the admin session
   - Session state is isolated per phone number to prevent interference

### Debug Commands
```bash
# Check admin user exists
# (Use your database client to verify)
SELECT * FROM users WHERE role = 'admin';

# View active sessions
SELECT * FROM sessions WHERE phone = 'YOUR_ADMIN_PHONE';
```

## Future Enhancements

- User management interface
- System configuration controls
- Advanced analytics and reporting
- Bulk operations for testing
- Integration with monitoring tools

## Support

For technical support or feature requests related to the admin functionality, contact the development team or check the system logs for detailed error information. 