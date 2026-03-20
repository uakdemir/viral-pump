import { readFile } from 'fs/promises';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { logger } from '../../shared/logger.js';

interface LinkedInApiConfig {
  accessToken?: string;
  personUrn?: string;
}

const MAX_TEXT_LENGTH = 3000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export class LinkedInApiPostingStrategy implements PostingStrategy {
  private accessToken: string | undefined;
  private personUrn: string | undefined;

  constructor(config: LinkedInApiConfig = {}) {
    this.accessToken = config.accessToken;
    this.personUrn = config.personUrn;
  }

  validateInput(input: PostInput): void {
    if (input.text.length > MAX_TEXT_LENGTH) {
      throw new Error(`LinkedIn text exceeds ${MAX_TEXT_LENGTH} characters (got ${input.text.length})`);
    }

    if (input.media) {
      if (input.media.type !== 'image') {
        throw new Error(`LinkedIn strategy only supports image media (got ${input.media.type})`);
      }
      if (input.media.fileSizeBytes && input.media.fileSizeBytes > MAX_FILE_SIZE_BYTES) {
        throw new Error(`Media file size exceeds 5 MB limit (got ${input.media.fileSizeBytes} bytes)`);
      }
    }
  }

  async post(input: PostInput): Promise<PostResult> {
    if (!this.accessToken || !this.personUrn) {
      throw new Error('LinkedIn credentials not configured');
    }

    const headers = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    };

    let imageAsset: string | undefined;

    if (input.media?.path) {
      // Step 1: Register upload
      logger.info('[LinkedIn] Registering image upload');

      const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: this.personUrn,
            serviceRelationships: [
              {
                relationshipType: 'OWNER',
                identifier: 'urn:li:userGeneratedContent',
              },
            ],
          },
        }),
      });

      if (!registerRes.ok) {
        const err = await registerRes.text();
        throw new Error(`LinkedIn register upload failed: ${err}`);
      }

      const registerData = (await registerRes.json()) as {
        value: {
          uploadMechanism: {
            'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
              uploadUrl: string;
            };
          };
          asset: string;
        };
      };

      const uploadUrl =
        registerData.value.uploadMechanism[
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'
        ].uploadUrl;
      imageAsset = registerData.value.asset;

      // Step 2: Upload binary
      logger.info({ uploadUrl }, '[LinkedIn] Uploading image binary');

      const imageBuffer = await readFile(input.media.path);

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': input.media.mimeType,
        },
        body: imageBuffer,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`LinkedIn image upload failed: ${err}`);
      }
    }

    // Step 3: Create UGC post
    logger.info('[LinkedIn] Creating UGC post');

    const ugcPayload: any = {
      author: this.personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: input.text },
          shareMediaCategory: imageAsset ? 'IMAGE' : 'NONE',
          ...(imageAsset && {
            media: [
              {
                status: 'READY',
                media: imageAsset,
                description: { text: input.media?.altText ?? '' },
              },
            ],
          }),
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    const postRes = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers,
      body: JSON.stringify(ugcPayload),
    });

    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`LinkedIn UGC post creation failed: ${err}`);
    }

    const postData = (await postRes.json()) as { id: string };

    logger.info({ postId: postData.id }, '[LinkedIn] Post published');

    return {
      platformPostId: postData.id,
      postedAt: new Date(),
    };
  }
}
