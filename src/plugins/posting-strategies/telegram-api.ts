import { readFile } from 'fs/promises';
import type { PostingStrategy, PostInput, PostResult } from './types.js';
import { validatePostInput } from './validation.js';
import { logger } from '../../shared/logger.js';

interface TelegramApiConfig {
  botToken?: string;
  channelId?: string;
}

const MAX_TEXT_LENGTH = 4096;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export class TelegramApiPostingStrategy implements PostingStrategy {
  private botToken: string | undefined;
  private channelId: string | undefined;

  constructor(config: TelegramApiConfig = {}) {
    this.botToken = config.botToken;
    this.channelId = config.channelId;
  }

  validateInput(input: PostInput): void {
    validatePostInput(input, {
      platformName: 'Telegram',
      maxTextLength: MAX_TEXT_LENGTH,
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeLabel: '10 MB',
      allowedMediaTypes: ['image'],
      allowedMimeTypes: ['image/jpeg', 'image/png'],
    });
  }

  async post(input: PostInput): Promise<PostResult> {
    if (!this.botToken) {
      throw new Error('Telegram bot token not configured');
    }

    const chatId = this.channelId ?? (input.platformMeta?.channelId as string);
    if (!chatId) {
      throw new Error('Telegram channelId not configured and not provided in platformMeta');
    }

    const baseUrl = `https://api.telegram.org/bot${this.botToken}`;

    let result: { message_id: number; date: number };

    if (input.media?.path) {
      // Send photo with caption
      logger.info({ chatId }, '[Telegram] Sending photo');

      const imageBuffer = await readFile(input.media.path);
      const formData = new FormData();
      formData.append('chat_id', chatId);
      formData.append('caption', input.text);
      formData.append(
        'photo',
        new Blob([imageBuffer], { type: input.media.mimeType }),
        'image.jpg',
      );

      const res = await fetch(`${baseUrl}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Telegram sendPhoto failed: ${err}`);
      }

      const data = (await res.json()) as { result: { message_id: number; date: number } };
      result = data.result;
    } else {
      // Send text message
      logger.info({ chatId }, '[Telegram] Sending message');

      const res = await fetch(`${baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: input.text,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Telegram sendMessage failed: ${err}`);
      }

      const data = (await res.json()) as { result: { message_id: number; date: number } };
      result = data.result;
    }

    logger.info({ messageId: result.message_id }, '[Telegram] Message sent');

    return {
      platformPostId: String(result.message_id),
      postedAt: new Date(result.date * 1000),
    };
  }
}
