// import { Agent, exists, Telegram } from "./deps.ts";
import { Telegraf } from "telegraf";
import { Agent } from "@atproto/api";
import { config } from "./config.ts";
import type { TelegramMessage } from "./types.ts";

export class TelegramBlueSkyBot {
  private telegram: Telegraf;
  private bluesky: Agent;
  private lastUpdateId = 0;

  constructor() {
    this.telegram = new Telegraf(config.telegram.botToken);

    this.bluesky = new Agent({
      service: "https://bsky.social",
    });
  }

  async init() {
    // Login to Bluesky
    await this.bluesky.login({
      identifier: config.bluesky.identifier,
      password: config.bluesky.password,
    });

    // Create media directory if it doesn't exist
    if (!(await exists(config.mediaDir))) {
      await Deno.mkdir(config.mediaDir);
    }
  }

  private async downloadMedia(fileId: string): Promise<string> {
    const filePath = `${config.mediaDir}/${fileId}`;
    const fileInfo = await this.telegram.getFile(fileId);

    // Telegram's file download URL
    const fileUrl =
      `https://api.telegram.org/file/bot${config.telegram.botToken}/${fileInfo.file_path}`;

    // Download file
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Save file
    await Deno.writeFile(filePath, uint8Array);

    return filePath;
  }

  private async uploadToBluesky(text: string, mediaPath?: string) {
    let images = [];

    if (mediaPath && (await exists(mediaPath))) {
      const file = await Deno.readFile(mediaPath);
      const upload = await this.bluesky.uploadBlob(file, {
        encoding: "image/jpeg",
      });

      images.push({
        image: upload.data.blob,
        alt: "Shared from Telegram",
      });
    }

    // Create post
    await this.bluesky.post({
      text: text.slice(0, 300), // Bluesky character limit
      embed: images.length > 0
        ? {
          $type: "app.bsky.embed.images",
          images,
        }
        : undefined,
    });
  }

  private async processMessage(message: TelegramMessage) {
    try {
      const text = message.text || message.caption || "";
      let mediaPath: string | undefined;

      // Handle photos
      if (message.photo && message.photo.length > 0) {
        // Get the highest quality photo (last in array)
        const photo = message.photo[message.photo.length - 1];
        mediaPath = await this.downloadMedia(photo.file_id);
      }

      // Handle videos
      if (message.video) {
        mediaPath = await this.downloadMedia(message.video.file_id);
      }

      // Cross-post to Bluesky
      await this.uploadToBluesky(text, mediaPath);

      // Cleanup
      if (mediaPath && (await exists(mediaPath))) {
        await Deno.remove(mediaPath);
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  }

  async pollUpdates() {
    while (true) {
      try {
        const updates = await this.telegram.getUpdates({
          offset: this.lastUpdateId + 1,
          timeout: 30,
        });

        for (const update of updates) {
          if (
            update.message &&
            update.message.chat.id.toString() === config.telegram.channelId
          ) {
            await this.processMessage(update.message);
          }
          this.lastUpdateId = update.update_id;
        }
      } catch (error) {
        console.error("Error polling updates:", error);
        // Wait before retrying on error
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  async start() {
    await this.init();
    console.log("Bot started. Monitoring for updates...");
    await this.pollUpdates();
  }
}
