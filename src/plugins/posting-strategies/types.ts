export interface MediaInput {
  type: 'image' | 'video' | 'gif' | 'carousel';
  path: string;              // local filesystem path (for file-upload strategies)
  publicUrl?: string;        // publicly reachable URL (for URL-based platform APIs)
  mimeType: string;
  width?: number;
  height?: number;
  durationMs?: number;
  fileSizeBytes?: number;
  altText?: string;
  additionalPaths?: string[];
}

export interface PostInput {
  text: string;
  media?: MediaInput;
  platformMeta?: Record<string, unknown>;
}

export interface PostResult {
  platformPostId: string;
  postedAt: Date;
  url?: string;
}

export interface PostingStrategy {
  validateInput(input: PostInput): void;
  post(input: PostInput): Promise<PostResult>;
}
