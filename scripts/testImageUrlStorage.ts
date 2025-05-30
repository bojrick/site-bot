import 'dotenv/config';
import { getDb } from '../src/db';
import { activities, material_requests } from '../src/db/schema';
import { desc, isNotNull } from 'drizzle-orm';
import axios from 'axios';

async function testImageUrlStorage() {
  console.log('🧪 Testing Image URL Storage in Database...\n');

  try {
    // 1. Check recent activities with images
    console.log('📋 Checking recent activities with images:');
    const recentActivities = await getDb()
      .select({
        id: activities.id,
        image_url: activities.image_url,
        image_key: activities.image_key,
        created_at: activities.created_at
      })
      .from(activities)
      .where(isNotNull(activities.image_url))
      .orderBy(desc(activities.created_at))
      .limit(5);

    if (recentActivities.length > 0) {
      console.log(`✅ Found ${recentActivities.length} activities with images:`);
      for (const activity of recentActivities) {
        console.log(`\n📸 Activity ${activity.id.slice(0, 8)}:`);
        console.log(`🔗 URL: ${activity.image_url}`);
        console.log(`🔑 Key: ${activity.image_key}`);
        console.log(`📅 Created: ${activity.created_at?.toISOString()}`);
        
        // Check if URL is public (contains r2.dev)
        if (activity.image_url?.includes('pub-480de15262b346c8b5ebf5e8141b43f9.r2.dev')) {
          console.log('✅ PUBLIC URL: Uses r2.dev domain');
          
          // Test URL accessibility
          try {
            const response = await axios.head(activity.image_url, { timeout: 5000 });
            console.log(`✅ ACCESSIBLE: Status ${response.status}`);
          } catch (error: any) {
            console.log(`❌ NOT ACCESSIBLE: ${error.response?.status || error.message}`);
          }
        } else if (activity.image_url?.includes('c924773969fa9cd80ba2bf5bae7cfb00.r2.cloudflarestorage.com')) {
          console.log('⚠️  PRIVATE URL: Uses private endpoint (old format)');
        } else {
          console.log('❓ UNKNOWN URL FORMAT');
        }
      }
    } else {
      console.log('❌ No activities with images found');
    }

    // 2. Check recent material requests with images
    console.log('\n\n📦 Checking recent material requests with images:');
    const recentRequests = await getDb()
      .select({
        id: material_requests.id,
        material_name: material_requests.material_name,
        image_url: material_requests.image_url,
        image_key: material_requests.image_key,
        created_at: material_requests.created_at
      })
      .from(material_requests)
      .where(isNotNull(material_requests.image_url))
      .orderBy(desc(material_requests.created_at))
      .limit(5);

    if (recentRequests.length > 0) {
      console.log(`✅ Found ${recentRequests.length} material requests with images:`);
      for (const request of recentRequests) {
        console.log(`\n📦 Request ${request.id.slice(0, 8)} (${request.material_name}):`);
        console.log(`🔗 URL: ${request.image_url}`);
        console.log(`🔑 Key: ${request.image_key}`);
        console.log(`📅 Created: ${request.created_at?.toISOString()}`);
        
        // Check if URL is public
        if (request.image_url?.includes('pub-480de15262b346c8b5ebf5e8141b43f9.r2.dev')) {
          console.log('✅ PUBLIC URL: Uses r2.dev domain');
          
          // Test URL accessibility
          try {
            const response = await axios.head(request.image_url, { timeout: 5000 });
            console.log(`✅ ACCESSIBLE: Status ${response.status}`);
          } catch (error: any) {
            console.log(`❌ NOT ACCESSIBLE: ${error.response?.status || error.message}`);
          }
        } else if (request.image_url?.includes('c924773969fa9cd80ba2bf5bae7cfb00.r2.cloudflarestorage.com')) {
          console.log('⚠️  PRIVATE URL: Uses private endpoint (old format)');
        } else {
          console.log('❓ UNKNOWN URL FORMAT');
        }
      }
    } else {
      console.log('❌ No material requests with images found');
    }

    // 3. Summary
    console.log('\n\n📋 SUMMARY:');
    const totalImages = recentActivities.length + recentRequests.length;
    
    if (totalImages === 0) {
      console.log('❓ No images found in database yet');
      console.log('💡 Upload some images via WhatsApp to test URL storage');
    } else {
      const publicUrls = [...recentActivities, ...recentRequests].filter(
        item => item.image_url?.includes('pub-480de15262b346c8b5ebf5e8141b43f9.r2.dev')
      ).length;
      
      console.log(`📊 Total images: ${totalImages}`);
      console.log(`✅ Public URLs: ${publicUrls}`);
      console.log(`⚠️  Private URLs: ${totalImages - publicUrls}`);
      
      if (publicUrls === totalImages) {
        console.log('🎉 ALL IMAGES USE PUBLIC URLS! Perfect!');
      } else if (publicUrls > 0) {
        console.log('⚠️  Mixed URL formats - old images use private URLs, new ones should use public');
      } else {
        console.log('❌ All images still use private URLs - configuration may need restart');
      }
    }

    console.log('\n🔧 NEXT STEPS:');
    console.log('1. Upload new images via WhatsApp to test public URL storage');
    console.log('2. Check that new URLs contain: pub-480de15262b346c8b5ebf5e8141b43f9.r2.dev');
    console.log('3. Verify URLs are publicly accessible in browser');

  } catch (error) {
    console.error('❌ Error testing image URL storage:', error);
  }

  console.log('\n🏁 Image URL storage test completed');
  process.exit(0);
}

// Run the test
testImageUrlStorage().catch(console.error); 