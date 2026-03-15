import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  Collection,
} from 'discord.js';
import config from '../config/config';
import logger from '../utils/logger';
import { Command } from './types';

// Импорт команд
import settingsCommand from './commands/settings';
import factionCommand from './commands/faction';
import historyCommand from './commands/history';
import newsCommand from './commands/news';
import statsCommand from './commands/stats';
import linkCommand from './commands/link';

// Импорт обработчиков событий
import readyHandler from './events/ready';
import interactionCreateHandler from './events/interactionCreate';
import channelDeleteHandler from './events/channelDelete';
import guildCreateHandler from './events/guildCreate';

/**
 * Класс Discord бота
 */
class DiscordBot {
  public client: Client;
  public commands: Collection<string, Command>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel, Partials.Message],
    });

    this.commands = new Collection();
  }

  /**
   * Регистрация команд
   */
  private registerCommands() {
    this.commands.set(settingsCommand.data.name, settingsCommand);
    this.commands.set(factionCommand.data.name, factionCommand);
    this.commands.set(historyCommand.data.name, historyCommand);
    this.commands.set(newsCommand.data.name, newsCommand);
    this.commands.set(statsCommand.data.name, statsCommand);
    this.commands.set(linkCommand.data.name, linkCommand);

    logger.info('Commands registered', {
      count: this.commands.size,
      commands: Array.from(this.commands.keys()),
    });
  }

  /**
   * Регистрация обработчиков событий
   */
  private registerEventHandlers() {
    this.client.once('clientReady', async () => {
      const guildIds = Array.from(this.client.guilds.cache.keys());
      await this.deployCommands(guildIds);
      readyHandler(this.client);
    });

    this.client.on('guildCreate', async (guild) => {
      await this.deployCommands([guild.id]);
      await guildCreateHandler(guild);
    });

    this.client.on('interactionCreate', (interaction) =>
      interactionCreateHandler(interaction, this.commands)
    );

    this.client.on('channelDelete', (channel) =>
      channelDeleteHandler(channel).catch(err =>
        logger.error('Unhandled error in channelDelete handler', { error: err instanceof Error ? err.message : err })
      )
    );

    logger.info('Event handlers registered');
  }

  /**
   * Развертывание slash команд для указанных гильдий
   */
  async deployCommands(guildIds: string[]) {
    const commandsData = Array.from(this.commands.values()).map((cmd) =>
      cmd.data.toJSON()
    );

    const rest = new REST({ version: '10' }).setToken(config.discord.token);

    for (const guildId of guildIds) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(config.discord.clientId, guildId),
          { body: commandsData }
        );
        logger.info('Slash commands deployed to guild', { guildId });
      } catch (error) {
        logger.error('Failed to deploy slash commands to guild', {
          guildId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  /**
   * Запуск бота
   */
  async start() {
    try {
      this.registerCommands();
      this.registerEventHandlers();

      // Подключение к Discord
      await this.client.login(config.discord.token);

      logger.info('Discord bot started successfully');
    } catch (error) {
      logger.error('Failed to start Discord bot', { error });
      throw error;
    }
  }

  /**
   * Остановка бота
   */
  async stop() {
    logger.info('Stopping Discord bot...');
    this.client.destroy();
    logger.info('Discord bot stopped');
  }
}

// Singleton instance
const discordBot = new DiscordBot();

export default discordBot;
export { DiscordBot };
