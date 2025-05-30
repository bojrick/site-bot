#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { EmployeeService } from '../src/services/employeeService';

// Load environment variables
dotenv.config();

const employeeService = new EmployeeService();

interface EmployeeData {
  phone: string;
  name?: string;
  email?: string;
}

async function addSingleEmployee() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('\n📋 Usage: npm run add-employee <phone> [name] [email]');
    console.log('📋 Example: npm run add-employee "9876543210" "John Doe" "john@example.com"');
    console.log('📋 Example: npm run add-employee "9876543210" "John Doe"');
    console.log('📋 Example: npm run add-employee "9876543210"');
    process.exit(1);
  }

  const [phone, name, email] = args;
  
  console.log('\n🔄 Adding employee...');
  console.log(`📱 Phone: ${phone}`);
  if (name) console.log(`👤 Name: ${name}`);
  if (email) console.log(`📧 Email: ${email}`);

  try {
    const result = await employeeService.addEmployee({ phone, name, email });
    
    if (result.success) {
      console.log('\n✅ Success!');
      console.log(`📋 ${result.message}`);
      console.log(`🆔 User ID: ${result.user?.id}`);
      console.log(`📱 Phone: ${result.user?.phone}`);
      console.log(`👤 Name: ${result.user?.name || 'Not set'}`);
      console.log(`📧 Email: ${result.user?.email || 'Not set'}`);
      console.log(`🔐 Verified: ${result.user?.is_verified ? 'Yes' : 'No (will need OTP)'}`);
    } else {
      console.log('\n❌ Failed!');
      console.log(`📋 ${result.message}`);
      if (result.error) {
        console.log(`🔍 Error: ${result.error}`);
      }
    }
  } catch (error) {
    console.error('\n💥 Unexpected error:', error);
  }
  
  process.exit(0);
}

async function addMultipleEmployees() {
  // Example employee data - you can modify this or read from a file
  const employees: EmployeeData[] = [
    { phone: '9876543210', name: 'John Doe', email: 'john@company.com' },
    { phone: '9876543211', name: 'Jane Smith', email: 'jane@company.com' },
    { phone: '9876543212', name: 'Bob Wilson' },
    { phone: '9876543213' }
  ];

  console.log('\n🔄 Adding multiple employees...');
  console.log(`📊 Total employees to add: ${employees.length}`);

  try {
    const result = await employeeService.addMultipleEmployees(employees);
    
    console.log('\n📊 Summary:');
    console.log(`✅ Successful: ${result.summary.successful}`);
    console.log(`❌ Failed: ${result.summary.failed}`);
    console.log(`📋 Total: ${result.summary.total}`);

    console.log('\n📋 Detailed Results:');
    result.results.forEach((result, index) => {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.phone} (${result.name || 'No name'}) - ${result.message}`);
    });

  } catch (error) {
    console.error('\n💥 Unexpected error:', error);
  }
  
  process.exit(0);
}

async function listEmployees() {
  console.log('\n🔄 Fetching all employees...');
  
  try {
    const employees = await employeeService.getAllEmployees();
    
    if (employees.length === 0) {
      console.log('\n📋 No employees found.');
      process.exit(0);
    }

    console.log(`\n👥 Found ${employees.length} employees:\n`);
    
    employees.forEach((emp, index) => {
      console.log(`${index + 1}. 📱 ${emp.phone}`);
      console.log(`   👤 Name: ${emp.name || 'Not set'}`);
      console.log(`   📧 Email: ${emp.email || 'Not set'}`);
      console.log(`   🔐 Verified: ${emp.is_verified ? 'Yes' : 'No'}`);
      console.log(`   📅 Created: ${emp.created_at?.toLocaleDateString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('\n💥 Error fetching employees:', error);
  }
  
  process.exit(0);
}

// Main execution
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'bulk':
      await addMultipleEmployees();
      break;
    case 'list':
      await listEmployees();
      break;
    default:
      await addSingleEmployee();
      break;
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
} 