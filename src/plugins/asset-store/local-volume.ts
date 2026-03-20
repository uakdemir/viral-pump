import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { AssetStore } from './types.js';

export class LocalVolumeAssetStore implements AssetStore {
  private publicBaseUrl: string;

  constructor(private baseDir: string, publicBaseUrl?: string) {
    // Default: assume the web server serves assets at http://localhost:PORT/assets/
    // In production, this should be a CDN/S3 URL
    this.publicBaseUrl = publicBaseUrl ?? 'http://localhost:3001/assets';
  }

  async store(id: string, buffer: Buffer, extension: string): Promise<string> {
    await mkdir(this.baseDir, { recursive: true });
    const filename = `${id}.${extension}`;
    const filepath = path.join(this.baseDir, filename);
    await writeFile(filepath, buffer);
    return `/assets/${filename}`;
  }

  resolve(url: string): string {
    const filename = url.replace('/assets/', '');
    return path.join(this.baseDir, filename);
  }

  getPublicUrl(url: string): string {
    const filename = url.replace('/assets/', '');
    return `${this.publicBaseUrl}/${filename}`;
  }
}
