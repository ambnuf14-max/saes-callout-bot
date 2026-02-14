import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  Collection,
} from 'discord.js';
import config from '../config/config';
import logger from '../utils/logger';
import { Command } from './types';

// Импорт команд
import settingsCommand from './commands/settings';
import factionCommand from './commands/faction';

// Импорт обработчиков событий
import readyHandler from './events/ready';
import interactionCreateHandler from './events/interactionCreate';

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

    logger.info('Commands registered', {
      count: this.commands.size,
      commands: Array.from(this.commands.keys()),
    });
  }

  /**
   * Регистрация обработчиков событий
   */
  private registerEventHandlers() {
    this.client.once('clientReady', () => readyHandler(this.client));
    this.client.on('interactionCreate', (interaction) =>
      interactionCreateHandler(interaction, this.commands)
    );

    logger.info('Event handlers registered');
  }

  /**
   * Развертывание slash команд в Discord
   */
  async deployCommands() {
    try {
      const commandsData = Array.from(this.commands.values()).map((cmd) =>
        cmd.data.toJSON()
      );

      logger.info('Deploying slash commands to Discord...', {
        count: commandsData.length,
      });

      const rest = new REST({ version: '10' }).setToken(config.discord.token);

      // Регистрация команд глобально (может занять до 1 часа)
      // Для быстрого тестирования используйте guild-specific команды
      await rest.put(Routes.applicationCommands(config.discord.clientId), {
        body: commandsData,
      });

      logger.info('Slash commands deployed successfully');
    } catch (error) {
      logger.error('Failed to deploy slash commands', { error });
      throw error;
    }
  }

  /**
   * Запуск бота
   */
  async start() {
    try {
      this.registerCommands();
      this.registerEventHandlers();

      // Развертывание команд в Discord
      await this.deployCommands();

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
