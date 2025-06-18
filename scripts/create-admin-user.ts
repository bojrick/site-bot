import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';

dotenv.config();

async function createAdminUser() {
  if (!process.env.SUPABASE_DB_URL) {
    console.error('❌ SUPABASE_DB_URL not found in environment variables');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL
  });
  
  await client.connect();
  const db = drizzle(client);

  // Admin phone number (change this to your test phone number)
  const adminPhone = process.env.ADMIN_PHONE || '+1234567890';
  const adminName = process.env.ADMIN_NAME || 'System Admin';

  try {
    console.log('🔧 Creating admin user...');
    
    // Check if admin user already exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.phone, adminPhone))
      .limit(1);

    if (existingUser.length > 0) {
      console.log('📱 Admin user already exists. Updating role...');
      await db.update(users)
        .set({ 
          role: 'admin',
          is_verified: true,
          verified_at: new Date(),
          name: adminName,
          updated_at: new Date()
        })
        .where(eq(users.phone, adminPhone));
    } else {
      console.log('📱 Creating new admin user...');
      await db.insert(users).values({
        phone: adminPhone,
        role: 'admin',
        name: adminName,
        is_verified: true,
        verified_at: new Date()
      });
    }

    console.log('✅ Admin user created/updated successfully!');
    console.log(`📱 Phone: ${adminPhone}`);
    console.log(`👤 Name: ${adminName}`);
    console.log(`🔧 Role: admin`);
    console.log('');
    console.log('💡 You can now send a WhatsApp message to the bot from this number to access the admin panel.');
    console.log('💡 Type "admin" or "menu" to see the admin interface.');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await client.end();
  }
}

// Get phone number from command line argument if provided
if (process.argv[2]) {
  process.env.ADMIN_PHONE = process.argv[2];
}

if (process.argv[3]) {
  process.env.ADMIN_NAME = process.argv[3];
}

createAdminUser(); 