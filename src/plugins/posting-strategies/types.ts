export interface PostInput {
  text: string;
  imagePath?: string;
}

export interface PostResult {
  platformPostId: string;
  postedAt: Date;
}

export interface PostingStrategy {
  post(input: PostInput): Promise<PostResult>;
}
