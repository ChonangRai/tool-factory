import { supabase } from "@/integrations/supabase/client";

export interface StorageUploadResult {
  id: string;
  path: string;
  url: string;
}

export interface StorageProvider {
  uploadFile: (file: File, path: string) => Promise<StorageUploadResult>;
  getDownloadUrl: (path: string, expiresIn?: number) => Promise<string>;
  deleteFile: (path: string) => Promise<void>;
  listFiles: (prefix: string) => Promise<string[]>;
}

/**
 * Storage abstraction layer for file operations
 * Current implementation: Supabase Storage
 * Future implementation: Azure Blob Storage (update this file and env vars only)
 */
class SupabaseStorageProvider implements StorageProvider {
  private bucket = 'receipts';

  async uploadFile(file: File, path: string): Promise<StorageUploadResult> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const url = await this.getDownloadUrl(data.path);

    return {
      id: data.id || data.path,
      path: data.path,
      url,
    };
  }

  async getDownloadUrl(path: string, expiresIn: number = 3600): Promise<string> {
    const { data } = supabase.storage
      .from(this.bucket)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  async deleteFile(path: string): Promise<void> {
    const { error } = await supabase.storage
      .from(this.bucket)
      .remove([path]);

    if (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .list(prefix);

    if (error) {
      throw new Error(`List failed: ${error.message}`);
    }

    return data.map(file => `${prefix}/${file.name}`);
  }
}

// Export singleton instance
// To switch to Azure Blob Storage:
// 1. Create AzureBlobStorageProvider class implementing StorageProvider
// 2. Update this line: export const storage = new AzureBlobStorageProvider();
// 3. Update environment variables
export const storage = new SupabaseStorageProvider();
