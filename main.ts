import { TelegramBlueSkyBot } from "./bot.ts";

if (import.meta.main) {
  const bot = new TelegramBlueSkyBot();
  await bot.start();
}
