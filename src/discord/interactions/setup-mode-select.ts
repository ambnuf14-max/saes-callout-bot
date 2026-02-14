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
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { EMOJI, COLORS, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Главный обработчик для setup mode interactions
 */
export async function handleSetupModeSelect(
  interaction: ButtonInteraction | StringSelectMenuInteraction
) {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      ephemeral: true,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Обработка кнопок выбора режима
    if (customId === 'setup_mode_auto') {
      await setupModeAuto(interaction as ButtonInteraction);
    } else if (customId === 'setup_mode_category') {
      await setupModeCategory(interaction as ButtonInteraction);
    } else if (customId === 'setup_mode_channel') {
      await setupModeChannel(interaction as ButtonInteraction);
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
    logger.error('Error handling setup mode select', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
      guildId: interaction.guild.id,
    });

    const content =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Произошла ошибка при настройке`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  }
}

/**
 * Режим 1: Автоматическое создание категории и канала
 */
async function setupModeAuto(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

  logger.info('Setting up callout system (auto mode)', {
    guildId: guild.id,
    userId: interaction.user.id,
  });

  // 1. Создать категорию "🚨 INCIDENTS"
  const category = await guild.channels.create({
    name: '🚨 INCIDENTS',
    type: ChannelType.GuildCategory,
    position: 0,
  });

  logger.info('Category created', { categoryId: category.id });

  // 2. Создать канал "callouts" в категории
  const calloutsChannel = await guild.channels.create({
    name: 'callouts',
    type: ChannelType.GuildText,
    parent: category.id,
    topic: 'Канал для создания каллаутов экстренных служб',
    permissionOverwrites: [
      {
        id: guild.id, // @everyone
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
      },
    ],
  });

  logger.info('Callouts channel created', { channelId: calloutsChannel.id });

  // 3. Создать сообщение с кнопкой
  const message = await createCalloutPanel(calloutsChannel);

  // 4. Сохранить настройки в БД
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer) {
    await ServerModel.update(existingServer.id, {
      callout_channel_id: calloutsChannel.id,
      callout_message_id: message.id,
      category_id: category.id,
    });
  } else {
    await ServerModel.create({
      guild_id: guild.id,
      callout_channel_id: calloutsChannel.id,
      callout_message_id: message.id,
      category_id: category.id,
    });
  }

  logger.info('Server settings saved (auto mode)', { guildId: guild.id });

  await interaction.editReply({
    content: MESSAGES.SETUP.SUCCESS(calloutsChannel.toString()),
    embeds: [],
    components: [],
  });
}

/**
 * Режим 2: Использовать существующую категорию
 */
async function setupModeCategory(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

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

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setTitle('📁 Выбор категории')
    .setDescription(
      'Выберите категорию, в которой бот создаст канал для каллаутов.\n\n' +
        `${EMOJI.INFO} Бот создаст текстовый канал **callouts** в выбранной категории.`
    )
    .setColor(COLORS.INFO);

  await interaction.editReply({
    content: '',
    embeds: [embed],
    components: [row],
  });
}

/**
 * Режим 3: Использовать существующий канал
 */
async function setupModeChannel(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  const guild = interaction.guild!;

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

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setTitle('💬 Выбор канала')
    .setDescription(
      'Выберите канал, в который бот разместит сообщение с кнопкой для создания каллаутов.\n\n' +
        `${EMOJI.INFO} Каналы инцидентов будут создаваться в категории выбранного канала (если есть).`
    )
    .setColor(COLORS.INFO);

  await interaction.editReply({
    content: '',
    embeds: [embed],
    components: [row],
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

  // Создать канал "callouts" в категории
  const calloutsChannel = await guild.channels.create({
    name: 'callouts',
    type: ChannelType.GuildText,
    parent: categoryId,
    topic: 'Канал для создания каллаутов экстренных служб',
    permissionOverwrites: [
      {
        id: guild.id, // @everyone
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        deny: [PermissionFlagsBits.SendMessages],
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
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer) {
    await ServerModel.update(existingServer.id, {
      callout_channel_id: calloutsChannel.id,
      callout_message_id: message.id,
      category_id: categoryId,
    });
  } else {
    await ServerModel.create({
      guild_id: guild.id,
      callout_channel_id: calloutsChannel.id,
      callout_message_id: message.id,
      category_id: categoryId,
    });
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

  // Создать сообщение с кнопкой в выбранном канале
  const message = await createCalloutPanel(channel);

  // Получить category_id (родительская категория канала или undefined)
  const categoryId = channel.parent?.id || undefined;

  // Сохранить настройки
  const existingServer = await ServerModel.findByGuildId(guild.id);
  if (existingServer) {
    await ServerModel.update(existingServer.id, {
      callout_channel_id: channelId,
      callout_message_id: message.id,
      category_id: categoryId,
    });
  } else {
    await ServerModel.create({
      guild_id: guild.id,
      callout_channel_id: channelId,
      callout_message_id: message.id,
      category_id: categoryId,
    });
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
            name: '🆕 Создать новое',
            value: 'Бот создаст новую категорию "🚨 INCIDENTS" и канал "callouts"',
          },
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
          .setCustomId('setup_mode_auto')
          .setLabel('🆕 Создать новое')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup_mode_category')
          .setLabel('📁 Категория')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('setup_mode_channel')
          .setLabel('💬 Канал')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  });
}

/**
 * Helper: Создать панель с кнопкой каллаута
 */
async function createCalloutPanel(channel: TextChannel) {
  const embed = new EmbedBuilder()
    .setTitle(MESSAGES.CALLOUT.TITLE_PANEL)
    .setDescription(MESSAGES.CALLOUT.DESCRIPTION_PANEL)
    .setColor(COLORS.INFO)
    .addFields([
      {
        name: `${EMOJI.INFO} Инструкция`,
        value:
          '1. Нажмите кнопку ниже\n' +
          '2. Выберите департамент из списка\n' +
          '3. Укажите место и описание инцидента\n' +
          '4. Система создаст канал и уведомит департамент',
      },
    ])
    .setFooter({ text: 'SAES Callout System' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('create_callout')
    .setLabel(MESSAGES.CALLOUT.BUTTON_CREATE)
    .setStyle(ButtonStyle.Primary);

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
