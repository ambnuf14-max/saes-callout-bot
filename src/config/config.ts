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
  };
}

function getConfig(): Config {
  const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'VK_TOKEN',
    'VK_GROUP_ID',
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
    },
  };
}

export default getConfig();
