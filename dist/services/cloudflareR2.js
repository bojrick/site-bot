"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.r2Service = exports.CloudflareR2Service = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const uuid_1 = require("uuid");
const axios_1 = __importDefault(require("axios"));
class CloudflareR2Service {
    constructor() {
        this.bucketName = process.env.CLOUDFLARE_R2_BUCKET;
        // R2 public URL can be either:
        // 1. Custom domain: https://your-domain.com
        // 2. Development URL: https://pub-{account_hash}.r2.dev
        // 3. Fallback to endpoint (for private access)
        this.publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL ||
            process.env.CLOUDFLARE_R2_DEV_URL ||
            `${process.env.CLOUDFLARE_R2_ENDPOINT}/${this.bucketName}`;
        this.s3Client = new client_s3_1.S3Client({
            region: process.env.CLOUDFLARE_R2_REGION || 'auto',
            endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
            credentials: {
                accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY,
                secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY,
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
    async uploadFile(fileBuffer, fileName, mimeType, folder) {
        try {
            // Generate unique filename
            const fileExtension = fileName.split('.').pop() || 'jpg';
            const uniqueFileName = `${(0, uuid_1.v4)()}.${fileExtension}`;
            const key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;
            const uploadParams = {
                Bucket: this.bucketName,
                Key: key,
                Body: fileBuffer,
                ContentType: mimeType,
                // Note: R2 doesn't support ACL parameter like S3
                // Public access is controlled at bucket level
            };
            const command = new client_s3_1.PutObjectCommand(uploadParams);
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
        }
        catch (error) {
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
    getPublicUrl(key) {
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
    async uploadFromWhatsAppMedia(mediaId, accessToken, folder) {
        try {
            // First, get media URL from WhatsApp
            const mediaResponse = await axios_1.default.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const mediaUrl = mediaResponse.data.url;
            const mimeType = mediaResponse.data.mime_type || 'image/jpeg';
            // Download the media file
            const fileResponse = await axios_1.default.get(mediaUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                },
                responseType: 'arraybuffer'
            });
            const fileBuffer = Buffer.from(fileResponse.data);
            const fileName = `whatsapp_${mediaId}.jpg`; // Default to jpg
            // Upload to R2
            return await this.uploadFile(fileBuffer, fileName, mimeType, folder);
        }
        catch (error) {
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
    async getSignedUrl(key, expiresIn = 3600) {
        try {
            const command = new client_s3_1.GetObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, { expiresIn });
            return signedUrl;
        }
        catch (error) {
            console.error('Error generating signed URL:', error);
            return null;
        }
    }
    /**
     * Delete a file from R2
     * @param key - File key to delete
     * @returns Promise<boolean>
     */
    async deleteFile(key) {
        try {
            const { DeleteObjectCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-s3')));
            const command = new DeleteObjectCommand({
                Bucket: this.bucketName,
                Key: key,
            });
            await this.s3Client.send(command);
            return true;
        }
        catch (error) {
            console.error('Error deleting file from R2:', error);
            return false;
        }
    }
}
exports.CloudflareR2Service = CloudflareR2Service;
// Export singleton instance
exports.r2Service = new CloudflareR2Service();
//# sourceMappingURL=cloudflareR2.js.map