export declare class CloudflareR2Service {
    private s3Client;
    private bucketName;
    private publicUrl;
    constructor();
    /**
     * Upload a file buffer to Cloudflare R2
     * @param fileBuffer - The file buffer to upload
     * @param fileName - Original filename
     * @param mimeType - MIME type of the file
     * @param folder - Optional folder path (e.g., 'activities', 'materials', 'sites')
     * @returns Promise<{success: boolean, url?: string, key?: string, error?: string}>
     */
    uploadFile(fileBuffer: Buffer, fileName: string, mimeType: string, folder?: string): Promise<{
        success: boolean;
        url?: string;
        key?: string;
        error?: string;
    }>;
    /**
     * Generate public URL for a given key
     * @param key - File key in R2
     * @returns Public URL string
     */
    private getPublicUrl;
    /**
     * Download file from WhatsApp and upload to R2
     * @param mediaId - WhatsApp media ID
     * @param accessToken - WhatsApp access token
     * @param folder - Optional folder path
     * @returns Promise<{success: boolean, url?: string, key?: string, error?: string}>
     */
    uploadFromWhatsAppMedia(mediaId: string, accessToken: string, folder?: string): Promise<{
        success: boolean;
        url?: string;
        key?: string;
        error?: string;
    }>;
    /**
     * Generate a presigned URL for file access
     * @param key - File key in R2
     * @param expiresIn - Expiration time in seconds (default: 3600)
     * @returns Promise<string | null>
     */
    getSignedUrl(key: string, expiresIn?: number): Promise<string | null>;
    /**
     * Delete a file from R2
     * @param key - File key to delete
     * @returns Promise<boolean>
     */
    deleteFile(key: string): Promise<boolean>;
}
export declare const r2Service: CloudflareR2Service;
//# sourceMappingURL=cloudflareR2.d.ts.map