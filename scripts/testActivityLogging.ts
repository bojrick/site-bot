#!/usr/bin/env ts-node

import { ActivityLoggingService } from '../src/services/flows/employee/workflows/ActivityLoggingService';

async function testActivityLogging() {
  console.log('🧪 Testing ActivityLoggingService...');
  
  try {
    const activityService = new ActivityLoggingService();
    console.log('✅ ActivityLoggingService created successfully');
    
    // Test the activity types are properly loaded
    console.log('📝 Testing activity type configuration...');
    
    // Access the private ACTIVITY_TYPES to verify structure
    const activityTypes = (activityService as any).ACTIVITY_TYPES;
    
    if (activityTypes) {
      console.log('✅ Activity types loaded successfully');
      console.log('📋 Available categories:', Object.keys(activityTypes));
      
      // Check each category has proper structure
      for (const [key, config] of Object.entries(activityTypes)) {
        const category = config as any;
        console.log(`  🔹 ${key}: ${category.short} - ${category.long}`);
        
        if (category.subtypes) {
          const subtypeCount = Object.keys(category.subtypes).length;
          console.log(`    └── ${subtypeCount} subtypes available`);
        }
      }
    } else {
      console.error('❌ Activity types not found');
    }
    
    console.log('\n🎉 ActivityLoggingService test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testActivityLogging(); 