import 'dotenv/config';
import { r2Service } from '../src/services/cloudflareR2';
import fs from 'fs';
import path from 'path';

async function testR2Integration() {
  console.log('🧪 Testing Cloudflare R2 Integration...\n');

  // Check environment variables
  console.log('🔍 Checking environment variables:');
  console.log('✓ CLOUDFLARE_R2_BUCKET:', process.env.CLOUDFLARE_R2_BUCKET);
  console.log('✓ CLOUDFLARE_R2_ENDPOINT:', process.env.CLOUDFLARE_R2_ENDPOINT);
  console.log('✓ CLOUDFLARE_R2_ACCESS_KEY exists:', !!process.env.CLOUDFLARE_R2_ACCESS_KEY);
  console.log('✓ CLOUDFLARE_R2_SECRET_KEY exists:', !!process.env.CLOUDFLARE_R2_SECRET_KEY);

  try {
    // Create a simple test file
    console.log('\n📝 Creating test file...');
    const testContent = 'This is a test file for Cloudflare R2 integration from Reeva ERP WhatsApp Bot';
    const testBuffer = Buffer.from(testContent, 'utf8');

    // Test upload
    console.log('📤 Testing file upload...');
    const uploadResult = await r2Service.uploadFile(
      testBuffer,
      'test.txt',
      'text/plain',
      'test-uploads'
    );

    if (uploadResult.success) {
      console.log('✅ Upload successful!');
      console.log('🔗 URL:', uploadResult.url);
      console.log('🔑 Key:', uploadResult.key);

      // Test signed URL generation
      if (uploadResult.key) {
        console.log('\n🔒 Testing signed URL generation...');
        const signedUrl = await r2Service.getSignedUrl(uploadResult.key, 3600);
        if (signedUrl) {
          console.log('✅ Signed URL generated:', signedUrl.substring(0, 80) + '...');
        } else {
          console.log('❌ Failed to generate signed URL');
        }

        // Test file deletion
        console.log('\n🗑️ Testing file deletion...');
        const deleteResult = await r2Service.deleteFile(uploadResult.key);
        if (deleteResult) {
          console.log('✅ File deleted successfully');
        } else {
          console.log('❌ Failed to delete file');
        }
      }

    } else {
      console.log('❌ Upload failed:', uploadResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }

  console.log('\n🏁 R2 integration test completed');
  process.exit(0);
}

testR2Integration(); 