import { Telegraf } from "telegraf";
import { Agent, AtpAgent, BskyAgent } from "@atproto/api";
import { config } from "./config.ts";
import type { TelegramMessage } from "./types.ts";
import type { Update } from "telegraf/types";
import { message } from "telegraf/filters";

export class TelegramBlueSkyBot {
  private bluesky: BskyAgent;
  private lastPostDate: Date = new Date(0); // Keep track of the last post we've processed

  constructor() {
    this.bluesky = new BskyAgent({
      service: "https://bsky.social",
    });
  }

  async init() {
    // Login to Bluesky
    await this.bluesky.login({
      identifier: config.bluesky.identifier,
      password: config.bluesky.password,
    });
  }

  // Parse the RSS feed and get new posts
  private async getFeedItems() {
    try {
      const response = await fetch("https://infobrics.org/rss/en/");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/xml");

      if (!doc) {
        throw new Error("Failed to parse RSS feed");
      }

      // Get all items from the feed
      const items = Array.from(doc.getElementsByTagName("item"));

      // Convert items to a more usable format
      return items.map((item) => ({
        title: item.querySelector("title")?.textContent || "",
        description: item.querySelector("description")?.textContent || "",
        pubDate: new Date(item.querySelector("pubDate")?.textContent || ""),
        link: item.querySelector("link")?.textContent || "",
      }));
    } catch (error) {
      console.error("Error fetching RSS feed:", error);
      return [];
    }
  }

  private async fileExists(filepath: string): Promise<boolean> {
    try {
      await Deno.stat(filepath);
      return true;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        return false;
      }
      throw error;
    }
  }

  private async downloadMedia(fileId: string): Promise<string> {
    const filePath = `${config.mediaDir}/${fileId}`;
    const fileInfo = await this.telegram.telegram.getFile(fileId);

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
    const images = [];

    if (mediaPath && (await this.fileExists(mediaPath))) {
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

  async start() {
    await this.init();
    console.log("Bot started. Monitoring for updates...");
    await this.pollUpdates();
  }
}
