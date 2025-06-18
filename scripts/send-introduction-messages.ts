#!/usr/bin/env ts-node

import dotenv from 'dotenv';
import { introductionService } from '../src/services/introductionService';
import { testConnection } from '../src/db';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Starting introduction message sender...');
  
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.log('❌ Database connection failed. Please check your configuration.');
    process.exit(1);
  }
  console.log('✅ Database connected successfully');

  try {
    // Send introduction messages to all pending employees
    const result = await introductionService.sendPendingIntroductionMessages();
    
    console.log('\n📊 Summary:');
    console.log(`• Total messages sent: ${result.sent}`);
    console.log(`• Failed messages: ${result.failed}`);
    
    if (result.sent > 0) {
      console.log('\n✅ Introduction messages sent successfully!');
    } else if (result.failed > 0) {
      console.log('\n⚠️ Some messages failed to send. Check the logs above.');
    } else {
      console.log('\nℹ️ No pending introduction messages found.');
    }
    
  } catch (error) {
    console.error('❌ Error sending introduction messages:', error);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📨 Introduction Message Sender

This script sends introduction messages to all employees who haven't received them yet.

Usage:
  npm run send-introductions
  or
  ts-node scripts/send-introduction-messages.ts

The script will:
1. Connect to the database
2. Find all employees without introduction messages
3. Send WhatsApp introduction messages
4. Update the database with delivery status

Environment variables required:
- SUPABASE_DB_URL
- WHATSAPP_ACCESS_TOKEN  
- WHATSAPP_PHONE_NUMBER_ID
`);
  process.exit(0);
}

// Run the main function
main().catch(console.error); 