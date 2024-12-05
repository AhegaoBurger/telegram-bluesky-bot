export const config = {
  telegram: {
    botToken: Deno.env.get("TELEGRAM_BOT_TOKEN") || "",
    channelId: Deno.env.get("TELEGRAM_CHANNEL_ID") || "",
  },
  bluesky: {
    identifier: Deno.env.get("BLUESKY_IDENTIFIER") || "",
    password: Deno.env.get("BLUESKY_PASSWORD") || "",
  },
  mediaDir: "./downloaded_media",
};
