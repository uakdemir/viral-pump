import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { AssetStore } from './types.js';

export class LocalVolumeAssetStore implements AssetStore {
  constructor(private baseDir: string) {}

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
}
