import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionFlagsBits,
  CategoryChannel,
  TextChannel,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { EMOJI, COLORS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { handleInteractionError } from '../utils/subdivision-settings-helper';
import { Server } from '../../types/database.types';
import { Guild } from 'discord.js';

/**
 * Очистить старую настройку системы (удалить сообщение, канал, категорию если были созданы ботом)
 */
async function cleanupOldSetup(guild: Guild, server: Server) {
  logger.info('Cleaning up old setup', { guildId: guild.id });

  try {
    // 1. Удалить старое сообщение с кнопкой
    if (server.callout_channel_id && server.callout_message_id) {
      try {
        const channel = await guild.channels.fetch(server.callout_channel_id);
        if (channel?.isTextBased()) {
          const message = await channel.messages.fetch(server.callout_message_id);
          await message.delete();
          logger.info('Deleted old callout panel message', {
            messageId: server.callout_message_id,
          });
        }
      } catch (error) {
        logger.warn('Failed to delete old callout panel message', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // 2. Удалить канал каллаутов (если был создан ботом)
    if (server.callout_channel_id && server.bot_created_channel) {
      try {
        const channel = await guild.channels.fetch(server.callout_channel_id);
        if (channel) {
          await channel.delete('Перенастройка системы каллаутов');
          logger.info('Deleted bot-created callout channel', {
            channelId: server.callout_channel_id,
          });
        }
      } catch (error) {
        logger.warn('Failed to delete bot-created callout channel', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // 3. Удалить категорию (если была создана ботом)
    if (server.category_id && server.bot_created_category) {
      try {
        const category = await guild.channels.fetch(server.category_id);
        if (category) {
          await category.delete('Перенастройка системы каллаутов');
          logger.info('Deleted bot-created category', {
            categoryId: server.category_id,
          });
        }
      } catch (error) {
        logger.warn('Failed to delete bot-created category', {
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    logger.info('Old setup cleaned up successfully');
  } catch (error) {
    logger.error('Error during cleanup', {
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Главный обработчик для setup mode interactions
 */
export async function handleSetupModeSelect(
  interaction: ButtonInteraction | StringSelectMenuInteraction
) {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Обработка кнопок выбора режима
    if (customId === 'setup_mode_category') {
      await setupModeCategory(interaction as ButtonInteraction);
    } else if (customId === 'setup_mode_channel') {
      await setupModeChannel(interaction as ButtonInteraction);
    }
    // Подтверждение перенастройки
    else if (customId === 'setup_confirm_category') {
      await setupModeCategoryConfirmed(interaction as ButtonInteraction);
    } else if (customId === 'setup_confirm_channel') {
      await setupModeChannelConfirmed(interaction as ButtonInteraction);
    }
    // Обработка select menu
    else if (customId === 'setup_select_category') {
      await setupSelectCategory(interaction as StringSelectMenuInteraction);
    } else if (customId === 'setup_select_channel') {
      await setupSelectChannel(interaction as StringSelectMenuInteraction);
    }
    // Кнопки перенастройки
    else if (customId === 'setup_keep') {
      await interaction.update({
        content: `${EMOJI.SUCCESS} Текущие настройки сохранены`,
        embeds: [],
        components: [],
      });
    } else if (customId === 'setup_reconfigure') {
      await showSetupModeSelection(interaction as ButtonInteraction);
    }
  } catch (error) {
    await handleInteractionError(error, interaction, 'Error handling setup mode select', `${EMOJI.ERROR} Произошла ошибка при настройке`, { logExtra: { guildId: interaction.guild?.id } });
  }
}

/**
 * Режим 1: Использовать существующую категорию
 */
async function setupModeCategory(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

  // Проверка: система уже настроена?
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer?.callout_channel_id) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI.WARNING} Система уже настроена`)
      .setDescription(
        `Система каллаутов уже настроена на этом сервере.\n\n` +
        `**Текущие настройки:**\n` +
        `Канал каллаутов: <#${existingServer.callout_channel_id}>\n` +
        `${existingServer.category_id ? `Категория: <#${existingServer.category_id}>` : 'Категория не настроена'}\n\n` +
        `**Вы уверены, что хотите перенастроить систему?**\n` +
        `Это заменит текущие настройки.`
      )
      .setColor(COLORS.WARNING);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_confirm_category')
        .setLabel('Продолжить перенастройку')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('admin_setup')
        .setLabel('Отмена')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
    return;
  }

  // Получить все категории на сервере
  const categories = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildCategory
  );

  if (categories.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} На сервере нет категорий. Создайте категорию или используйте автоматический режим.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Валидация: проверить права бота на создание каналов
  const botMember = await guild.members.fetchMe();
  const validCategories = categories.filter((cat) => {
    const category = cat as CategoryChannel;
    const permissions = category.permissionsFor(botMember);
    return (
      permissions?.has(PermissionFlagsBits.ManageChannels) &&
      permissions?.has(PermissionFlagsBits.ViewChannel)
    );
  });

  if (validCategories.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} У бота нет прав на создание каналов ни в одной категории. Проверьте права доступа.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Создать select menu с категориями
  const options = validCategories.map((cat) => ({
    label: cat.name,
    value: cat.id,
    description: `ID: ${cat.id}`,
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('setup_select_category')
    .setPlaceholder('Выберите категорию')
    .addOptions(options.slice(0, 25)); // Discord limit: 25 options

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_reconfigure')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('📁 Выбор категории')
    .setDescription(
      'Выберите категорию, в которой бот создаст канал для каллаутов.\n\n' +
        `${EMOJI.INFO} Бот создаст текстовый канал **callouts** в выбранной категории.`
    )
    .setColor(COLORS.INFO);

  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, buttonRow],
  });
}

/**
 * Режим 1 (подтверждение): Использовать существующую категорию (без проверки)
 */
async function setupModeCategoryConfirmed(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

  // Получить все категории на сервере (без проверки настройки)
  const categories = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildCategory
  );

  if (categories.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} На сервере нет категорий.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Валидация: проверить права бота на создание каналов
  const botMember = await guild.members.fetchMe();
  const validCategories = categories.filter((cat) => {
    const category = cat as CategoryChannel;
    const permissions = category.permissionsFor(botMember);
    return (
      permissions?.has(PermissionFlagsBits.ManageChannels) &&
      permissions?.has(PermissionFlagsBits.ViewChannel)
    );
  });

  if (validCategories.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} У бота нет прав на создание каналов ни в одной категории. Проверьте права доступа.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Создать select menu с категориями
  const options = validCategories.map((cat) => ({
    label: cat.name,
    value: cat.id,
    description: `ID: ${cat.id}`,
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('setup_select_category')
    .setPlaceholder('Выберите категорию')
    .addOptions(options.slice(0, 25)); // Discord limit: 25 options

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_reconfigure')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('📁 Выбор категории')
    .setDescription(
      'Выберите категорию, в которой бот создаст канал для каллаутов.\n\n' +
        `${EMOJI.INFO} Бот создаст текстовый канал **callouts** в выбранной категории.`
    )
    .setColor(COLORS.INFO);

  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, buttonRow],
  });
}

/**
 * Режим 2: Использовать существующий канал
 */
async function setupModeChannel(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

  // Проверка: система уже настроена?
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer?.callout_channel_id) {
    const embed = new EmbedBuilder()
      .setTitle(`${EMOJI.WARNING} Система уже настроена`)
      .setDescription(
        `Система каллаутов уже настроена на этом сервере.\n\n` +
        `**Текущие настройки:**\n` +
        `Канал каллаутов: <#${existingServer.callout_channel_id}>\n` +
        `${existingServer.category_id ? `Категория: <#${existingServer.category_id}>` : 'Категория не настроена'}\n\n` +
        `**Вы уверены, что хотите перенастроить систему?**\n` +
        `Это заменит текущие настройки.`
      )
      .setColor(COLORS.WARNING);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_confirm_channel')
        .setLabel('Продолжить перенастройку')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('admin_setup')
        .setLabel('Отмена')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
    return;
  }

  // Получить все текстовые каналы на сервере
  const textChannels = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildText
  );

  if (textChannels.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} На сервере нет текстовых каналов.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Валидация: проверить права бота на отправку сообщений
  const botMember = await guild.members.fetchMe();
  const validChannels = textChannels.filter((ch) => {
    const channel = ch as TextChannel;
    const permissions = channel.permissionsFor(botMember);
    return (
      permissions?.has(PermissionFlagsBits.SendMessages) &&
      permissions?.has(PermissionFlagsBits.ViewChannel) &&
      permissions?.has(PermissionFlagsBits.EmbedLinks)
    );
  });

  if (validChannels.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} У бота нет прав на отправку сообщений ни в одном канале.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Создать select menu с каналами
  const options = validChannels.map((ch) => ({
    label: `#${ch.name}`,
    value: ch.id,
    description: ch.parent ? `Категория: ${ch.parent.name}` : 'Без категории',
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('setup_select_channel')
    .setPlaceholder('Выберите канал')
    .addOptions(options.slice(0, 25)); // Discord limit: 25 options

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_reconfigure')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('💬 Выбор канала')
    .setDescription(
      'Выберите канал, в который бот разместит сообщение с кнопкой для создания каллаутов.\n\n' +
        `${EMOJI.INFO} Каналы инцидентов будут создаваться в категории выбранного канала (если есть).`
    )
    .setColor(COLORS.INFO);

  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, buttonRow],
  });
}

/**
 * Режим 2 (подтверждение): Использовать существующий канал (без проверки)
 */
async function setupModeChannelConfirmed(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

  // Получить все текстовые каналы на сервере (без проверки настройки)
  const textChannels = guild.channels.cache.filter(
    (ch) => ch.type === ChannelType.GuildText
  );

  if (textChannels.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} На сервере нет текстовых каналов.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Валидация: проверить права бота на отправку сообщений
  const botMember = await guild.members.fetchMe();
  const validChannels = textChannels.filter((ch) => {
    const channel = ch as TextChannel;
    const permissions = channel.permissionsFor(botMember);
    return (
      permissions?.has(PermissionFlagsBits.SendMessages) &&
      permissions?.has(PermissionFlagsBits.ViewChannel) &&
      permissions?.has(PermissionFlagsBits.EmbedLinks)
    );
  });

  if (validChannels.size === 0) {
    await interaction.editReply({
      content: `${EMOJI.ERROR} У бота нет прав на отправку сообщений ни в одном канале.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Создать select menu с каналами
  const options = validChannels.map((ch) => ({
    label: `#${ch.name}`,
    value: ch.id,
    description: ch.parent ? `Категория: ${ch.parent.name}` : 'Без категории',
  }));

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('setup_select_channel')
    .setPlaceholder('Выберите канал')
    .addOptions(options.slice(0, 25)); // Discord limit: 25 options

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_reconfigure')
      .setLabel('Назад')
      .setStyle(ButtonStyle.Secondary)
  );

  const embed = new EmbedBuilder()
    .setTitle('💬 Выбор канала')
    .setDescription(
      'Выберите канал, в который бот разместит сообщение с кнопкой для создания каллаутов.\n\n' +
        `${EMOJI.INFO} Каналы инцидентов будут создаваться в категории выбранного канала (если есть).`
    )
    .setColor(COLORS.INFO);

  await interaction.editReply({
    embeds: [embed],
    components: [selectRow, buttonRow],
  });
}

/**
 * Обработка выбора категории
 */
async function setupSelectCategory(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;
  const categoryId = interaction.values[0];

  logger.info('Category selected for setup', {
    categoryId,
    userId: interaction.user.id,
    guildId: guild.id,
  });

  // Получить категорию
  const category = (await guild.channels.fetch(categoryId)) as CategoryChannel;
  if (!category) {
    throw new CalloutError('Категория не найдена', 'CATEGORY_NOT_FOUND', 404);
  }

  // Очистить старую настройку (если есть)
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer) {
    await cleanupOldSetup(guild, existingServer);
  }

  // Создать канал "callouts" в категории
  const calloutsChannel = await guild.channels.create({
    name: 'создать-каллаут',
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: 'Канал для создания каллаутов экстренных служб',
    permissionOverwrites: [
      {
        id: guild.id, // @everyone
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
      {
        id: guild.members.me!.id, // Бот — может отправлять сообщения
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ],
  });

  logger.info('Callouts channel created in selected category', {
    channelId: calloutsChannel.id,
    categoryId,
  });

  // Создать сообщение с кнопкой
  const message = await createCalloutPanel(calloutsChannel);

  // Сохранить настройки
  if (existingServer) {
    await ServerModel.update(existingServer.id, {
      callout_channel_id: calloutsChannel.id,
      callout_message_id: message.id,
      category_id: categoryId,
      bot_created_channel: 1, // Канал создан ботом
      bot_created_category: 0, // Категория выбрана существующая
    });
  } else {
    await ServerModel.create({
      guild_id: guild.id,
      callout_channel_id: calloutsChannel.id,
      callout_message_id: message.id,
      category_id: categoryId,
    });
    // Установить флаги после создания
    const newServer = await ServerModel.findByGuildId(guild.id);
    if (newServer) {
      await ServerModel.update(newServer.id, {
        bot_created_channel: 1,
        bot_created_category: 0,
      });
    }
  }

  logger.info('Server settings saved (category mode)', { guildId: guild.id });

  await interaction.editReply({
    content: MESSAGES.SETUP.SUCCESS(calloutsChannel.toString()),
    embeds: [],
    components: [],
  });
}

/**
 * Обработка выбора канала
 */
async function setupSelectChannel(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;
  const channelId = interaction.values[0];

  logger.info('Channel selected for setup', {
    channelId,
    userId: interaction.user.id,
    guildId: guild.id,
  });

  // Получить канал
  const channel = (await guild.channels.fetch(channelId)) as TextChannel;
  if (!channel) {
    throw new CalloutError('Канал не найден', 'CHANNEL_NOT_FOUND', 404);
  }

  // Очистить старую настройку (если есть)
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer) {
    await cleanupOldSetup(guild, existingServer);
  }

  // Создать сообщение с кнопкой в выбранном канале
  const message = await createCalloutPanel(channel);

  // Получить category_id (родительская категория канала или undefined)
  const categoryId = channel.parent?.id || undefined;

  // Сохранить настройки
  if (existingServer) {
    await ServerModel.update(existingServer.id, {
      callout_channel_id: channelId,
      callout_message_id: message.id,
      category_id: categoryId,
      bot_created_channel: 0, // Канал выбран существующий
      bot_created_category: 0, // Категория выбрана существующая
    });
  } else {
    await ServerModel.create({
      guild_id: guild.id,
      callout_channel_id: channelId,
      callout_message_id: message.id,
      category_id: categoryId,
    });
    // Установить флаги после создания
    const newServer = await ServerModel.findByGuildId(guild.id);
    if (newServer) {
      await ServerModel.update(newServer.id, {
        bot_created_channel: 0,
        bot_created_category: 0,
      });
    }
  }

  logger.info('Server settings saved (channel mode)', {
    guildId: guild.id,
    categoryId: categoryId || 'null',
  });

  await interaction.editReply({
    content: MESSAGES.SETUP.SUCCESS(channel.toString()),
    embeds: [],
    components: [],
  });
}

/**
 * Показать выбор режима настройки
 */
export async function showSetupModeSelection(interaction: ButtonInteraction) {
  await interaction.update({
    content: '',
    embeds: [
      new EmbedBuilder()
        .setTitle('🔧 Настройка системы каллаутов')
        .setDescription('Выберите режим настройки:')
        .addFields([
          {
            name: '📁 Использовать категорию',
            value: 'Выберите существующую категорию, бот создаст канал в ней',
          },
          {
            name: '💬 Использовать канал',
            value: 'Выберите существующий канал для размещения кнопки каллаутов',
          },
        ])
        .setColor(COLORS.INFO)
        .setFooter({ text: 'SAES Callout System' }),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_mode_category')
          .setLabel('📁 Категория')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_mode_channel')
          .setLabel('💬 Канал')
          .setStyle(ButtonStyle.Primary)
      ),
    ],
  });
}

/**
 * Создать панель с кнопкой каллаута
 */
export async function createCalloutPanel(channel: TextChannel) {
  const embed = new EmbedBuilder()
    .setTitle(MESSAGES.CALLOUT.TITLE_PANEL)
    .setDescription(MESSAGES.CALLOUT.DESCRIPTION_PANEL)
    .setColor(COLORS.ACTIVE)
    .setFooter({ text: 'SAES Callout System' })
    .setThumbnail('https://www.upload.ee/image/19094728/red_logo_saes.png')
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('create_callout')
    .setLabel(MESSAGES.CALLOUT.BUTTON_CREATE)
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

  const message = await channel.send({
    embeds: [embed],
    components: [row],
  });

  logger.info('Callout panel message created', {
    messageId: message.id,
    channelId: channel.id,
  });

  return message;
}
