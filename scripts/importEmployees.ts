#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { EmployeeService } from '../src/services/employeeService';

// Load environment variables
dotenv.config();

const employeeService = new EmployeeService();

interface CSVEmployee {
  phone: string;
  name?: string;
  email?: string;
}

function parseCSV(csvContent: string): CSVEmployee[] {
  const lines = csvContent.trim().split('\n');
  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  
  // Find column indices
  const phoneIndex = header.findIndex(h => h.includes('phone'));
  const nameIndex = header.findIndex(h => h.includes('name'));
  const emailIndex = header.findIndex(h => h.includes('email'));
  
  if (phoneIndex === -1) {
    throw new Error('CSV must have a column containing "phone"');
  }
  
  const employees: CSVEmployee[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
    
    if (row.length <= phoneIndex || !row[phoneIndex]) {
      console.log(`⚠️  Skipping row ${i + 1}: Missing or empty phone number`);
      continue;
    }
    
    const employee: CSVEmployee = {
      phone: row[phoneIndex],
      name: nameIndex !== -1 && row[nameIndex] ? row[nameIndex] : undefined,
      email: emailIndex !== -1 && row[emailIndex] ? row[emailIndex] : undefined
    };
    
    employees.push(employee);
  }
  
  return employees;
}

function createSampleCSV() {
  const samplePath = path.join(__dirname, 'sample_employees.csv');
  const sampleContent = `phone,name,email
9876543210,John Doe,john@company.com
9876543211,Jane Smith,jane@company.com
9876543212,Bob Wilson,
9876543213,Alice Brown,alice@company.com
9876543214,Charlie Davis,charlie@company.com`;

  fs.writeFileSync(samplePath, sampleContent);
  
  console.log('\n📄 Sample CSV created at:', samplePath);
  console.log('\n📋 CSV Format:');
  console.log('- First row should contain headers');
  console.log('- Must have a column with "phone" in the header');
  console.log('- Optional columns: "name", "email"');
  console.log('- Phone numbers can be 10 digits or with country code');
  console.log('\n📝 Sample content:');
  console.log(sampleContent);
}

async function importFromCSV(filePath: string) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    
    console.log(`\n📂 Reading CSV file: ${filePath}`);
    
    // Read and parse CSV
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const employees = parseCSV(csvContent);
    
    if (employees.length === 0) {
      console.log('⚠️  No valid employees found in CSV file.');
      process.exit(1);
    }
    
    console.log(`\n📊 Found ${employees.length} employees to import`);
    
    // Preview first few employees
    console.log('\n👀 Preview (first 3 employees):');
    employees.slice(0, 3).forEach((emp, index) => {
      console.log(`${index + 1}. 📱 ${emp.phone} | 👤 ${emp.name || 'N/A'} | 📧 ${emp.email || 'N/A'}`);
    });
    
    if (employees.length > 3) {
      console.log(`   ... and ${employees.length - 3} more`);
    }
    
    // Ask for confirmation (in a real CLI app, you might use readline)
    console.log('\n🔄 Starting import...');
    
    // Import employees
    const result = await employeeService.addMultipleEmployees(employees);
    
    console.log('\n📊 Import Summary:');
    console.log(`✅ Successfully added: ${result.summary.successful}`);
    console.log(`❌ Failed to add: ${result.summary.failed}`);
    console.log(`📋 Total processed: ${result.summary.total}`);
    
    // Show failed imports
    const failed = result.results.filter(r => !r.success);
    if (failed.length > 0) {
      console.log('\n❌ Failed Imports:');
      failed.forEach(fail => {
        console.log(`   📱 ${fail.phone} - ${fail.message}`);
      });
    }
    
    // Show successful imports
    const successful = result.results.filter(r => r.success);
    if (successful.length > 0) {
      console.log('\n✅ Successful Imports:');
      successful.slice(0, 5).forEach(success => {
        console.log(`   📱 ${success.phone} (${success.name || 'No name'}) - ${success.message}`);
      });
      
      if (successful.length > 5) {
        console.log(`   ... and ${successful.length - 5} more`);
      }
    }
    
  } catch (error) {
    console.error('\n💥 Error importing CSV:', error);
    process.exit(1);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'sample') {
    createSampleCSV();
    return;
  }
  
  if (!command) {
    console.log('\n📋 CSV Employee Import Tool');
    console.log('\n🔧 Usage:');
    console.log('  npm run import-employees <csv-file>     - Import from CSV file');
    console.log('  npm run import-employees sample         - Create sample CSV file');
    console.log('\n📝 Examples:');
    console.log('  npm run import-employees employees.csv');
    console.log('  npm run import-employees ./data/staff.csv');
    console.log('  npm run import-employees sample');
    process.exit(1);
  }
  
  const filePath = path.resolve(command);
  await importFromCSV(filePath);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
} 