import { Agent, AtpAgent, BskyAgent } from "@atproto/api";
import { config } from "./config.ts";
import { DOMParser, Element } from "jsr:@b-fuze/deno-dom";

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

  private async postToBluesky(
    item: { title: string; description: string; link: string },
  ) {
    // Create a post formatted nicely for Bluesky
    const text = `${item.title}\n\n${item.link}`;

    try {
      await this.bluesky.post({
        text: text.slice(0, 300), // Respect Bluesky's character limit
      });
      console.log("Posted to Bluesky:", item.title);
    } catch (error) {
      console.error("Error posting to Bluesky:", error);
    }
  }

  async pollUpdates() {
    while (true) {
      try {
        const items = await this.getFeedItems();

        // Sort items by date, newest first
        const sortedItems = items.sort((a, b) =>
          b.pubDate.getTime() - a.pubDate.getTime()
        );

        // Post any new items we haven't seen before
        for (const item of sortedItems) {
          if (item.pubDate > this.lastPostDate) {
            await this.postToBluesky(item);
            this.lastPostDate = item.pubDate;
          }
        }

        // Wait for 5 minutes before checking again
        // This is a reasonable interval for RSS feeds
        await new Promise((resolve) => setTimeout(resolve, 5 * 60 * 1000));
      } catch (error) {
        console.error("Error in poll loop:", error);
        // Wait before retrying on error
        await new Promise((resolve) => setTimeout(resolve, 30000));
      }
    }
  }

  async start() {
    await this.init();
    console.log("Bot started. Monitoring for updates...");
    await this.pollUpdates();
  }
}
