import 'dotenv/config';
import { r2Service } from '../src/services/cloudflareR2';
import axios from 'axios';

async function testR2PublicAccess() {
  console.log('🧪 Testing Cloudflare R2 Public Access Configuration...\n');

  // 1. Check environment variables
  console.log('🔍 Environment Configuration:');
  console.log('✓ CLOUDFLARE_R2_BUCKET:', process.env.CLOUDFLARE_R2_BUCKET);
  console.log('✓ CLOUDFLARE_R2_ENDPOINT:', process.env.CLOUDFLARE_R2_ENDPOINT);
  console.log('✓ CLOUDFLARE_R2_DEV_URL:', process.env.CLOUDFLARE_R2_DEV_URL || '❌ NOT SET');
  console.log('✓ CLOUDFLARE_R2_PUBLIC_URL:', process.env.CLOUDFLARE_R2_PUBLIC_URL || '❌ NOT SET');
  
  if (!process.env.CLOUDFLARE_R2_DEV_URL && !process.env.CLOUDFLARE_R2_PUBLIC_URL) {
    console.log('\n⚠️  WARNING: No public URL configured!');
    console.log('Please set either CLOUDFLARE_R2_DEV_URL or CLOUDFLARE_R2_PUBLIC_URL in your .env file');
    console.log('See R2_PUBLIC_ACCESS_SETUP.md for detailed instructions');
  }

  try {
    // 2. Test file upload
    console.log('\n📝 Creating test image file...');
    const testImageContent = 'Test image content for R2 public access verification';
    const testBuffer = Buffer.from(testImageContent, 'utf8');

    console.log('📤 Testing image upload to activities folder...');
    const uploadResult = await r2Service.uploadFile(
      testBuffer,
      'test-image.jpg',
      'image/jpeg',
      'activities'
    );

    if (uploadResult.success && uploadResult.url) {
      console.log('✅ Upload successful!');
      console.log('🔗 Generated URL:', uploadResult.url);
      console.log('🔑 File Key:', uploadResult.key);

      // 3. Test public URL accessibility
      console.log('\n🌐 Testing public URL accessibility...');
      try {
        const response = await axios.head(uploadResult.url, {
          timeout: 10000
        });
        
        if (response.status === 200) {
          console.log('✅ PUBLIC URL IS ACCESSIBLE! 🎉');
          console.log('📊 Status:', response.status);
          console.log('📋 Content-Type:', response.headers['content-type']);
        } else {
          console.log('⚠️  Unexpected status:', response.status);
        }
      } catch (urlError: any) {
        if (urlError.response?.status === 403) {
          console.log('❌ PUBLIC URL NOT ACCESSIBLE (403 Forbidden)');
          console.log('📝 This means your R2 bucket is still private.');
          console.log('🔧 Follow the setup guide in R2_PUBLIC_ACCESS_SETUP.md');
        } else if (urlError.response?.status === 404) {
          console.log('⚠️  File not found (404) - this might be expected for a new upload');
          console.log('🔄 Trying again in a few seconds...');
          
          // Wait and retry once
          await new Promise(resolve => setTimeout(resolve, 3000));
          try {
            const retryResponse = await axios.head(uploadResult.url);
            console.log('✅ PUBLIC URL IS ACCESSIBLE ON RETRY! 🎉');
          } catch (retryError: any) {
            console.log('❌ Still not accessible:', retryError.response?.status || retryError.message);
          }
        } else {
          console.log('❌ Error testing URL:', urlError.response?.status || urlError.message);
        }
      }

      // 4. Test signed URL generation (fallback)
      if (uploadResult.key) {
        console.log('\n🔒 Testing signed URL generation (fallback method)...');
        const signedUrl = await r2Service.getSignedUrl(uploadResult.key, 3600);
        if (signedUrl) {
          console.log('✅ Signed URL generated successfully');
          console.log('🔗 Signed URL:', signedUrl.substring(0, 80) + '...');
          
          // Test signed URL
          try {
            const signedResponse = await axios.head(signedUrl);
            console.log('✅ SIGNED URL IS ACCESSIBLE! 🎉');
          } catch (signedError: any) {
            console.log('❌ Signed URL not accessible:', signedError.message);
          }
        } else {
          console.log('❌ Failed to generate signed URL');
        }

        // 5. Cleanup test file
        console.log('\n🗑️  Cleaning up test file...');
        const deleteResult = await r2Service.deleteFile(uploadResult.key);
        if (deleteResult) {
          console.log('✅ Test file deleted successfully');
        } else {
          console.log('⚠️  Failed to delete test file');
        }
      }

    } else {
      console.log('❌ Upload failed:', uploadResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }

  // 6. Summary and recommendations
  console.log('\n📋 SUMMARY & RECOMMENDATIONS:');
  
  if (process.env.CLOUDFLARE_R2_DEV_URL || process.env.CLOUDFLARE_R2_PUBLIC_URL) {
    console.log('✅ Public URL configuration found');
    console.log('🔍 Run this test again after uploading to verify public access');
  } else {
    console.log('❌ No public URL configuration found');
    console.log('📝 REQUIRED ACTIONS:');
    console.log('   1. Go to Cloudflare Dashboard → R2 → reeva-erp bucket');
    console.log('   2. Settings → Public Development URL → Enable');
    console.log('   3. Add CLOUDFLARE_R2_DEV_URL="https://pub-{hash}.r2.dev" to .env');
    console.log('   4. Restart your application');
  }

  console.log('\n🏁 R2 public access test completed');
  process.exit(0);
}

// Run the test
testR2PublicAccess().catch(console.error); 