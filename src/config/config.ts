import dotenv from 'dotenv';

dotenv.config();

interface Config {
  // Discord
  discord: {
    token: string;
    clientId: string;
  };

  // VK
  vk: {
    token: string;
    groupId: string;
  };

  // Telegram
  telegram: {
    token: string;
    botUsername: string;
    webhookUrl: string | null;
    webhookPort: number;
    webhookSecret: string | null;
  };

  // Database
  database: {
    path: string;
  };

  // Logging
  logging: {
    level: string;
    file: string;
  };

  // Features
  features: {
    autoDeleteChannels: boolean;
    channelDeleteDelay: number;
    calloutAutoCloseMs: number;
  };
}

function getConfig(): Config {
  const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'VK_TOKEN',
    'VK_GROUP_ID',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_BOT_USERNAME',
  ];

  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file'
    );
  }

  return {
    discord: {
      token: process.env.DISCORD_TOKEN!,
      clientId: process.env.DISCORD_CLIENT_ID!,
    },

    vk: {
      token: process.env.VK_TOKEN!,
      groupId: process.env.VK_GROUP_ID!,
    },

    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN!,
      botUsername: process.env.TELEGRAM_BOT_USERNAME!,
      webhookUrl: process.env.TELEGRAM_WEBHOOK_URL || null,
      webhookPort: parseInt(process.env.TELEGRAM_WEBHOOK_PORT || '8443', 10),
      webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || null,
    },

    database: {
      path: process.env.DATABASE_PATH || './data/database.sqlite',
    },

    logging: {
      level: process.env.LOG_LEVEL || 'info',
      file: process.env.LOG_FILE || './logs/bot.log',
    },

    features: {
      autoDeleteChannels: process.env.AUTO_DELETE_CHANNELS === 'true',
      channelDeleteDelay: parseInt(process.env.CHANNEL_DELETE_DELAY || '300000', 10),
      calloutAutoCloseMs: parseInt(process.env.CALLOUT_AUTO_CLOSE_DELAY || '3600000', 10),
    },
  };
}

export default getConfig();
