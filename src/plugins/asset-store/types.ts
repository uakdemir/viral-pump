export interface AssetStore {
  store(id: string, buffer: Buffer, extension: string): Promise<string>;
  resolve(url: string): string;      // local filesystem path
  getPublicUrl(url: string): string;  // publicly reachable URL for platform APIs
}
