# Employee Management Guide

This guide explains the different ways to add and manage employee phone numbers in your WhatsApp CRM system.

## 🏗️ Database Structure

Employees are stored in the `users` table with:
- `phone`: Unique phone number (with country code)
- `role`: Set to "employee" 
- `name`: Optional employee name
- `email`: Optional employee email
- `is_verified`: Initially false (employees need OTP verification)

## 📱 Adding Employees

### 1. **Command Line Interface (CLI) - Quick & Easy**

#### Add Single Employee
```bash
# Basic - just phone number
npm run add-employee "9876543210"

# With name
npm run add-employee "9876543210" "John Doe"

# With name and email
npm run add-employee "9876543210" "John Doe" "john@company.com"
```

#### List All Employees
```bash
npm run list-employees
```

### 2. **CSV Import - Bulk Addition**

#### Create Sample CSV
```bash
npm run import-employees sample
```

#### Import from CSV
```bash
npm run import-employees employees.csv
npm run import-employees ./data/staff.csv
```

**CSV Format:**
```csv
phone,name,email
9876543210,John Doe,john@company.com
9876543211,Jane Smith,jane@company.com
9876543212,Bob Wilson,
```

### 3. **REST API - Programmatic Access**

#### Add Single Employee
```bash
curl -X POST http://localhost:3000/admin/employees \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210",
    "name": "John Doe",
    "email": "john@company.com"
  }'
```

#### Add Multiple Employees
```bash
curl -X POST http://localhost:3000/admin/employees/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "employees": [
      {"phone": "9876543210", "name": "John Doe", "email": "john@company.com"},
      {"phone": "9876543211", "name": "Jane Smith", "email": "jane@company.com"}
    ]
  }'
```

#### Get All Employees
```bash
curl http://localhost:3000/admin/employees
```

#### Update Employee
```bash
curl -X PUT http://localhost:3000/admin/employees/9876543210 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "email": "johnsmith@company.com"
  }'
```

#### Remove Employee
```bash
curl -X DELETE http://localhost:3000/admin/employees/9876543210
```

## 🔐 Employee Verification Process

1. **Employee Added**: When you add an employee, they're created with `is_verified: false`
2. **First WhatsApp Message**: When they send their first message, they receive an OTP
3. **OTP Verification**: They enter the 6-digit code to verify their account
4. **Access Granted**: Once verified, they can use all employee features

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/employees` | Add single employee |
| `POST` | `/admin/employees/bulk` | Add multiple employees |
| `GET` | `/admin/employees` | List all employees |
| `PUT` | `/admin/employees/:phone` | Update employee info |
| `DELETE` | `/admin/employees/:phone` | Remove employee (converts to customer) |

## 🔧 Phone Number Format

The system automatically handles phone number formatting:
- Accepts: `9876543210` or `919876543210` or `+919876543210`
- Stores as: `919876543210` (with country code)
- Supports Indian phone numbers (+91)

## 💡 Best Practices

### For Small Teams (< 50 employees)
Use the **CLI commands** for quick additions:
```bash
npm run add-employee "9876543210" "John Doe"
```

### For Large Teams (> 50 employees)
Use **CSV import** for bulk operations:
1. Export employee data from your HR system
2. Format as CSV with phone, name, email columns
3. Import using: `npm run import-employees employees.csv`

### For Integration with Other Systems
Use the **REST API** to integrate with:
- HR management systems
- Employee onboarding apps
- Admin dashboards

## 🚨 Error Handling

The system handles common issues:
- **Duplicate phones**: Won't create duplicates, returns existing user
- **Invalid formats**: Automatically cleans and validates phone numbers
- **Missing data**: Only phone number is required
- **Role conversion**: Can convert customers to employees seamlessly

## 📈 Monitoring

Check employee status:
```bash
# List all employees and their verification status
npm run list-employees

# Or via API
curl http://localhost:3000/admin/employees
```

## 🔍 Troubleshooting

### Employee Can't Receive OTP
1. Check if phone number is correct
2. Verify WhatsApp Business API is working
3. Check if employee's WhatsApp is active

### Employee Already Exists Error
```bash
# Update existing employee instead
curl -X PUT http://localhost:3000/admin/employees/9876543210 \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name"}'
```

### Database Connection Issues
1. Check `SUPABASE_DB_URL` in `.env`
2. Run database migration: `npm run drizzle:push`
3. Test connection: `npm run drizzle:studio`

## 🎯 Example Workflows

### Onboarding New Employees
1. HR adds employee via CSV import
2. Employee receives WhatsApp message with OTP
3. Employee verifies and gains access
4. Employee can log activities, request materials

### Bulk Employee Import
1. Export from HR system as CSV
2. Run: `npm run import-employees employees.csv`
3. Review import results
4. Notify employees about WhatsApp access

### Employee Management
1. Use CLI for quick adds: `npm run add-employee`
2. Use API for system integration
3. Monitor with: `npm run list-employees` 