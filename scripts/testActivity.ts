import 'dotenv/config';
import { getDb } from '../src/db';
import { activities, users, sites } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function testActivityLogging() {
  const db = getDb();
  
  try {
    // Get a test user (employee)
    const testUsers = await db.select().from(users).where(eq(users.role, 'employee')).limit(1);
    
    if (testUsers.length === 0) {
      console.log('❌ No employees found. Please add an employee first using: npm run add-employee');
      return;
    }

    const testUser = testUsers[0];
    console.log(`📱 Testing with user: ${testUser.phone} (${testUser.name || 'No name'})`);

    // Get available sites
    const availableSites = await db.select().from(sites).limit(3);
    console.log(`🏗️ Available sites: ${availableSites.length}`);
    
    if (availableSites.length === 0) {
      console.log('❌ No sites found. Running populate-sites...');
      return;
    }

    // Test activity logging
    const testActivity = {
      user_id: testUser.id,
      site_id: availableSites[0].id, // Use actual UUID
      activity_type: 'construction',
      hours: 8,
      description: 'Test activity logging - બાંધકામ કાર્ય',
      details: {
        logged_via: 'whatsapp',
        language: 'gujarati',
        test: true
      }
    };

    console.log('\n🔄 Inserting test activity...');
    const result = await db.insert(activities).values(testActivity).returning();
    
    console.log('✅ Activity logged successfully!');
    console.log(`📋 Activity ID: ${result[0].id}`);
    console.log(`🏗️ Site: ${availableSites[0].name}`);
    console.log(`⏰ Hours: ${result[0].hours}`);
    console.log(`📝 Type: ${result[0].activity_type}`);

    // Clean up test data
    await db.delete(activities).where(eq(activities.id, result[0].id));
    console.log('🧹 Test activity cleaned up');

  } catch (error) {
    console.error('❌ Error testing activity logging:', error);
  }

  process.exit(0);
}

testActivityLogging(); 