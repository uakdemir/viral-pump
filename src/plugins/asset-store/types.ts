export interface AssetStore {
  store(id: string, buffer: Buffer, extension: string): Promise<string>;
  resolve(url: string): string;
}
