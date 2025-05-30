import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export class CloudflareR2Service {
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    this.bucketName = process.env.CLOUDFLARE_R2_BUCKET!;
    
    // R2 public URL can be either:
    // 1. Custom domain: https://your-domain.com
    // 2. Development URL: https://pub-{account_hash}.r2.dev
    // 3. Fallback to endpoint (for private access)
    this.publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || 
                     process.env.CLOUDFLARE_R2_DEV_URL ||
                     `${process.env.CLOUDFLARE_R2_ENDPOINT}/${this.bucketName}`;
    
    this.s3Client = new S3Client({
      region: process.env.CLOUDFLARE_R2_REGION || 'auto',
      endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
      },
    });

    console.log('🔧 R2 Service initialized:');
    console.log('📦 Bucket:', this.bucketName);
    console.log('🌐 Public URL:', this.publicUrl);
  }

  /**
   * Upload a file buffer to Cloudflare R2
   * @param fileBuffer - The file buffer to upload
   * @param fileName - Original filename
   * @param mimeType - MIME type of the file
   * @param folder - Optional folder path (e.g., 'activities', 'materials', 'sites')
   * @returns Promise<{success: boolean, url?: string, key?: string, error?: string}>
   */
  async uploadFile(
    fileBuffer: Buffer, 
    fileName: string, 
    mimeType: string, 
    folder?: string
  ): Promise<{success: boolean; url?: string; key?: string; error?: string}> {
    try {
      // Generate unique filename
      const fileExtension = fileName.split('.').pop() || 'jpg';
      const uniqueFileName = `${uuidv4()}.${fileExtension}`;
      const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;

      const uploadParams = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        // Note: R2 doesn't support ACL parameter like S3
        // Public access is controlled at bucket level
      };

      const command = new PutObjectCommand(uploadParams);
      await this.s3Client.send(command);

      // Construct public URL based on configuration
      const publicUrl = this.getPublicUrl(key);

      console.log('✅ File uploaded successfully:');
      console.log('🔑 Key:', key);
      console.log('🌐 Public URL:', publicUrl);

      return {
        success: true,
        url: publicUrl,
        key: key
      };

    } catch (error) {
      console.error('❌ Error uploading to Cloudflare R2:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate public URL for a given key
   * @param key - File key in R2
   * @returns Public URL string
   */
  private getPublicUrl(key: string): string {
    // If using custom domain or r2.dev URL, don't include bucket name
    if (this.publicUrl.includes('r2.dev') || !this.publicUrl.includes(this.bucketName)) {
      return `${this.publicUrl}/${key}`;
    }
    
    // Legacy format for endpoint-based URLs
    return `${this.publicUrl}/${key}`;
  }

  /**
   * Download file from WhatsApp and upload to R2
   * @param mediaId - WhatsApp media ID
   * @param accessToken - WhatsApp access token
   * @param folder - Optional folder path
   * @returns Promise<{success: boolean, url?: string, key?: string, error?: string}>
   */
  async uploadFromWhatsAppMedia(
    mediaId: string, 
    accessToken: string, 
    folder?: string
  ): Promise<{success: boolean; url?: string; key?: string; error?: string}> {
    try {
      // First, get media URL from WhatsApp
      const mediaResponse = await axios.get(
        `https://graph.facebook.com/v17.0/${mediaId}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const mediaUrl = mediaResponse.data.url;
      const mimeType = mediaResponse.data.mime_type || 'image/jpeg';

      // Download the media file
      const fileResponse = await axios.get(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        responseType: 'arraybuffer'
      });

      const fileBuffer = Buffer.from(fileResponse.data);
      const fileName = `whatsapp_${mediaId}.jpg`; // Default to jpg

      // Upload to R2
      return await this.uploadFile(fileBuffer, fileName, mimeType, folder);

    } catch (error) {
      console.error('Error downloading from WhatsApp and uploading to R2:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Generate a presigned URL for file access
   * @param key - File key in R2
   * @param expiresIn - Expiration time in seconds (default: 3600)
   * @returns Promise<string | null>
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error('Error generating signed URL:', error);
      return null;
    }
  }

  /**
   * Delete a file from R2
   * @param key - File key to delete
   * @returns Promise<boolean>
   */
  async deleteFile(key: string): Promise<boolean> {
    try {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.error('Error deleting file from R2:', error);
      return false;
    }
  }
}

// Export singleton instance
export const r2Service = new CloudflareR2Service(); 