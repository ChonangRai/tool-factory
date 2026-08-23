import { supabase } from "@/integrations/supabase/client";

export interface StorageUploadResult {
  id: string;
  path: string;
  url: string;
}

export interface StorageProvider {
  uploadFile: (file: File, path: string) => Promise<StorageUploadResult>;
  getDownloadUrl: (path: string, expiresIn?: number, downloadFilename?: string) => Promise<string>;
  deleteFile: (path: string) => Promise<void>;
  listFiles: (prefix: string) => Promise<string[]>;
}

// Strips characters that could otherwise inject response-header syntax
// (quotes, CRLF, path separators) into the Content-Disposition filename.
function sanitizeDownloadFilename(name: string): string {
  const cleaned = name.replace(/[\r\n"\\/]/g, '_').trim();
  return cleaned.slice(0, 200) || 'download';
}

/**
 * Storage abstraction layer for file operations
 * Current implementation: Supabase Storage
 * Future implementation: Azure Blob Storage (update this file and env vars only)
 */
class SupabaseStorageProvider implements StorageProvider {
  private bucket = 'submissions';

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

    // No download URL is generated here: the bucket is private and the
    // anonymous submitter who just uploaded has no read access (by design --
    // see the Storage SELECT policy). Callers only need the path to pass to
    // submit_form.
    return {
      id: data.id || data.path,
      path: data.path,
      url: '',
    };
  }

  // Pass downloadFilename to force `Content-Disposition: attachment` (real
  // downloads, e.g. the "Download" action). Omit it for preview URLs used
  // in an <img> tag -- images render fine either way, but previews should
  // not force a save-as prompt. Authorization already happened server-side:
  // createSignedUrl only succeeds if the caller's org membership passes the
  // Storage SELECT policy (see 029/030); this option only changes response
  // headers, not who can obtain a URL at all.
  async getDownloadUrl(path: string, expiresIn: number = 3600, downloadFilename?: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(
        path,
        expiresIn,
        downloadFilename ? { download: sanitizeDownloadFilename(downloadFilename) } : undefined
      );

    if (error || !data) {
      throw new Error(`Failed to create download URL: ${error?.message ?? 'unknown error'}`);
    }

    return data.signedUrl;
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
