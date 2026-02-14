import { ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { VerificationService } from '../../services/verification.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import {
  buildMainPanel,
  buildSubdivisionsList,
  buildSubdivisionDetailPanel,
  buildVerificationInstructions,
  buildDeleteConfirmation,
} from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик кнопок лидерской панели
 */
export async function handleDepartmentPanelButton(interaction: ButtonInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);

  // Получить департамент лидера
  const department = await getLeaderDepartment(member);
  if (!department) {
    await interaction.reply({
      content: MESSAGES.DEPARTMENT.NO_DEPARTMENT,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Просмотр списка подразделений
    if (customId === 'department_view_subdivisions') {
      await handleViewSubdivisions(interaction, department.id);
    }
    // Добавление подразделения (показать modal)
    else if (customId === 'department_add_subdivision') {
      await showAddSubdivisionModal(interaction);
    }
    // Возврат к главной панели
    else if (customId === 'department_back_main') {
      await handleBackToMain(interaction, department.id);
    }
    // Возврат к списку подразделений
    else if (customId === 'department_back_list') {
      await handleViewSubdivisions(interaction, department.id);
    }
    // Изменение подразделения
    else if (customId.startsWith('department_edit_sub_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await showEditSubdivisionModal(interaction, subdivisionId);
    }
    // Привязка VK беседы
    else if (customId.startsWith('department_link_vk_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleLinkVk(interaction, subdivisionId, department.id);
    }
    // Привязка Telegram группы
    else if (customId.startsWith('department_link_telegram_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleLinkTelegram(interaction, subdivisionId, department.id);
    }
    // Отвязка VK беседы
    else if (customId.startsWith('department_unlink_vk_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleUnlinkVk(interaction, subdivisionId, department.id);
    }
    // Отвязка Telegram группы
    else if (customId.startsWith('department_unlink_telegram_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleUnlinkTelegram(interaction, subdivisionId, department.id);
    }
    // Переключение приема каллаутов
    else if (customId.startsWith('department_toggle_callouts_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleToggleCallouts(interaction, subdivisionId, department.id);
    }
    // Настройка embed подразделения
    else if (customId.startsWith('department_configure_embed_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await showConfigureEmbedModal(interaction, subdivisionId);
    }
    // Удаление подразделения (показать подтверждение)
    else if (customId.startsWith('department_delete_sub_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await showDeleteConfirmation(interaction, subdivisionId, department.id);
    }
    // Подтверждение удаления
    else if (customId.startsWith('department_confirm_delete_')) {
      const subdivisionId = parseInt(customId.split('_')[3]);
      await handleDeleteSubdivision(interaction, subdivisionId, department.id);
    }
    // Отмена удаления
    else if (customId === 'department_cancel_delete') {
      await handleViewSubdivisions(interaction, department.id);
    }
    // Возврат к подразделению из верификации
    else if (customId === 'department_back_subdivision') {
      // Получить subdivision_id из сообщения (предполагаем что оно сохранено)
      await handleViewSubdivisions(interaction, department.id);
    }
  } catch (error) {
    logger.error('Error handling department panel button', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Произошла ошибка при выполнении действия`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Показать список подразделений
 */
async function handleViewSubdivisions(interaction: ButtonInteraction, departmentId: number) {
  await interaction.deferUpdate();

  const subdivisions = await SubdivisionService.getSubdivisionsByDepartmentId(departmentId);

  // Получить департамент
  const { DepartmentModel } = await import('../../database/models');
  const department = await DepartmentModel.findById(departmentId);
  if (!department) {
    throw new CalloutError('Департамент не найден', 'DEPARTMENT_NOT_FOUND', 404);
  }

  const panel = buildSubdivisionsList(department, subdivisions);

  await interaction.editReply(panel);
}

/**
 * Возврат к главной панели
 */
async function handleBackToMain(interaction: ButtonInteraction, departmentId: number) {
  await interaction.deferUpdate();

  const { DepartmentModel } = await import('../../database/models');
  const department = await DepartmentModel.findById(departmentId);
  if (!department) {
    throw new CalloutError('Департамент не найден', 'DEPARTMENT_NOT_FOUND', 404);
  }

  const subdivisions = await SubdivisionService.getSubdivisionsByDepartmentId(departmentId);
  const activeCount = subdivisions.filter((sub) => sub.is_active).length;

  const panel = buildMainPanel(department, subdivisions.length, activeCount);

  await interaction.editReply(panel);
}

/**
 * Показать modal для добавления подразделения
 */
async function showAddSubdivisionModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId('department_modal_add_subdivision')
    .setTitle('Добавить подразделение');

  const nameInput = new TextInputBuilder()
    .setCustomId('subdivision_name')
    .setLabel('Название подразделения')
    .setPlaceholder('Например: Patrol Division')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(50);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('subdivision_description')
    .setLabel('Описание (опционально)')
    .setPlaceholder('Краткое описание подразделения')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200);

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

/**
 * Показать modal для редактирования подразделения
 */
async function showEditSubdivisionModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const modal = new ModalBuilder()
    .setCustomId(`department_modal_edit_subdivision_${subdivisionId}`)
    .setTitle(`Изменить: ${subdivision.name}`);

  const nameInput = new TextInputBuilder()
    .setCustomId('subdivision_name')
    .setLabel('Название подразделения')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(2)
    .setMaxLength(50)
    .setValue(subdivision.name);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('subdivision_description')
    .setLabel('Описание')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(200)
    .setValue(subdivision.description || '');

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);

  modal.addComponents(row1, row2);

  await interaction.showModal(modal);
}

/**
 * Обработка привязки VK беседы
 */
async function handleLinkVk(interaction: ButtonInteraction, subdivisionId: number, departmentId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Генерировать токен верификации
  const token = await VerificationService.generateVerificationToken({
    server_id: subdivision.server_id,
    subdivision_id: subdivisionId,
    created_by: interaction.user.id,
  });

  // Получить инструкции
  const instructions = await VerificationService.generateInstructions(token.id);

  // Показать инструкции
  const panel = buildVerificationInstructions(instructions);

  const message = await interaction.editReply(panel);

  // Сохранить Discord message ID для последующего редактирования
  const { VerificationTokenModel } = await import('../../database/models');
  await VerificationTokenModel.updateDiscordMessage(
    token.id,
    interaction.channelId,
    message.id
  );

  logger.info('VK verification token generated via panel', {
    tokenId: token.id,
    subdivisionId,
    userId: interaction.user.id,
    messageId: message.id,
  });
}

/**
 * Обработка привязки Telegram группы
 */
async function handleLinkTelegram(interaction: ButtonInteraction, subdivisionId: number, departmentId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Генерировать токен верификации для Telegram
  const token = await VerificationService.generateVerificationToken({
    server_id: subdivision.server_id,
    subdivision_id: subdivisionId,
    created_by: interaction.user.id,
    platform: 'telegram',
  });

  // Получить инструкции
  const instructions = await VerificationService.generateInstructions(token.id);

  // Показать инструкции
  const panel = buildVerificationInstructions(instructions);

  const message = await interaction.editReply(panel);

  // Сохранить Discord message ID для последующего редактирования
  const { VerificationTokenModel } = await import('../../database/models');
  await VerificationTokenModel.updateDiscordMessage(
    token.id,
    interaction.channelId,
    message.id
  );

  logger.info('Telegram verification token generated via panel', {
    tokenId: token.id,
    subdivisionId,
    userId: interaction.user.id,
    messageId: message.id,
  });
}

/**
 * Обработка отвязки VK беседы
 */
async function handleUnlinkVk(interaction: ButtonInteraction, subdivisionId: number, departmentId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  if (!subdivision.vk_chat_id) {
    throw new CalloutError('VK беседа не привязана', 'VK_NOT_LINKED', 400);
  }

  // Отправить прощальное сообщение в VK беседу и выйти
  try {
    const vkBot = (await import('../../vk/bot')).default;

    await vkBot.getApi().api.messages.send({
      peer_id: parseInt(subdivision.vk_chat_id),
      message: `${EMOJI.INFO} Бот был отвязан от подразделения "${subdivision.name}".\n\nДо встречи!`,
      random_id: Math.floor(Math.random() * 1000000),
    });

    logger.info('Sent goodbye message to VK chat', {
      subdivisionId,
      vkChatId: subdivision.vk_chat_id,
    });
  } catch (error) {
    logger.warn('Failed to send goodbye message to VK', {
      error: error instanceof Error ? error.message : error,
      vkChatId: subdivision.vk_chat_id,
    });
  }

  // Отвязать VK беседу в БД
  await SubdivisionService.updateSubdivision(subdivisionId, { vk_chat_id: null });

  // Показать обновленную панель
  const updatedSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!updatedSubdivision) {
    throw new Error('Failed to retrieve updated subdivision');
  }

  const panel = buildSubdivisionDetailPanel(updatedSubdivision);
  await interaction.editReply(panel);

  logger.info('VK chat unlinked successfully', {
    subdivisionId,
    userId: interaction.user.id,
  });
}

/**
 * Обработка отвязки Telegram группы
 */
async function handleUnlinkTelegram(interaction: ButtonInteraction, subdivisionId: number, departmentId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  if (!subdivision.telegram_chat_id) {
    throw new CalloutError('Telegram группа не привязана', 'TELEGRAM_NOT_LINKED', 400);
  }

  const telegramBot = (await import('../../telegram/bot')).default;

  // Отправить прощальное сообщение в Telegram группу
  try {
    await telegramBot.getApi().sendMessage(
      subdivision.telegram_chat_id,
      `${EMOJI.INFO} Бот был отвязан от подразделения "${subdivision.name}".\n\nДо встречи!`
    );

    logger.info('Sent goodbye message to Telegram chat', {
      subdivisionId,
      telegramChatId: subdivision.telegram_chat_id,
    });
  } catch (error) {
    logger.warn('Failed to send goodbye message to Telegram', {
      error: error instanceof Error ? error.message : error,
      telegramChatId: subdivision.telegram_chat_id,
    });
  }

  // Покинуть группу (независимо от результата отправки сообщения)
  try {
    await telegramBot.getApi().leaveChat(subdivision.telegram_chat_id);

    logger.info('Left Telegram chat successfully', {
      subdivisionId,
      telegramChatId: subdivision.telegram_chat_id,
    });
  } catch (error) {
    logger.warn('Failed to leave Telegram chat', {
      error: error instanceof Error ? error.message : error,
      telegramChatId: subdivision.telegram_chat_id,
    });
  }

  // Отвязать Telegram группу в БД
  await SubdivisionService.updateSubdivision(subdivisionId, { telegram_chat_id: null });

  // Показать обновленную панель
  const updatedSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!updatedSubdivision) {
    throw new Error('Failed to retrieve updated subdivision');
  }

  const panel = buildSubdivisionDetailPanel(updatedSubdivision);
  await interaction.editReply(panel);

  logger.info('Telegram chat unlinked successfully', {
    subdivisionId,
    userId: interaction.user.id,
  });
}

/**
 * Переключение приема каллаутов
 */
async function handleToggleCallouts(interaction: ButtonInteraction, subdivisionId: number, departmentId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Переключить флаг
  const newStatus = !subdivision.is_accepting_callouts;
  await SubdivisionService.toggleCallouts(subdivisionId, newStatus);

  // Обновить панель подразделения
  const updatedSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!updatedSubdivision) {
    throw new Error('Failed to retrieve updated subdivision');
  }

  const panel = buildSubdivisionDetailPanel(updatedSubdivision);

  await interaction.editReply(panel);

  logger.info('Subdivision callouts toggled via panel', {
    subdivisionId,
    newStatus,
    userId: interaction.user.id,
  });
}

/**
 * Показать подтверждение удаления
 */
async function showDeleteConfirmation(interaction: ButtonInteraction, subdivisionId: number, departmentId: number) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  const panel = buildDeleteConfirmation(subdivision);

  await interaction.editReply(panel);
}

/**
 * Удаление подразделения
 */
async function handleDeleteSubdivision(
  interaction: ButtonInteraction,
  subdivisionId: number,
  departmentId: number
) {
  await interaction.deferUpdate();

  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (subdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  await SubdivisionService.deleteSubdivision(subdivisionId);

  // Вернуться к списку подразделений
  await handleViewSubdivisions(interaction, departmentId);

  logger.info('Subdivision deleted via panel', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });
}

/**
 * Показать modal для настройки embed подразделения
 */
async function showConfigureEmbedModal(interaction: ButtonInteraction, subdivisionId: number) {
  const subdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  const modal = new ModalBuilder()
    .setCustomId(`department_modal_configure_embed_${subdivisionId}`)
    .setTitle(`Настроить Embed: ${subdivision.name.substring(0, 30)}`);

  // Поле 1: Заголовок
  const titleInput = new TextInputBuilder()
    .setCustomId('embed_title')
    .setLabel('Заголовок Embed')
    .setPlaceholder('Оставьте пустым для использования названия подразделения')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(256)
    .setValue(subdivision.embed_title || '');

  // Поле 2: Описание
  const descriptionInput = new TextInputBuilder()
    .setCustomId('embed_description')
    .setLabel('Описание Embed')
    .setPlaceholder('Оставьте пустым для использования описания подразделения')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(4096)
    .setValue(subdivision.embed_description || '');

  // Поле 3: URL изображения
  const imageInput = new TextInputBuilder()
    .setCustomId('embed_image_url')
    .setLabel('URL основного изображения')
    .setPlaceholder('https://example.com/image.png')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.embed_image_url || '');

  // Поле 4: URL миниатюры
  const thumbnailInput = new TextInputBuilder()
    .setCustomId('embed_thumbnail_url')
    .setLabel('URL миниатюры (thumbnail)')
    .setPlaceholder('https://example.com/thumbnail.png')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setValue(subdivision.embed_thumbnail_url || '');

  // Поле 5: Цвет
  const colorInput = new TextInputBuilder()
    .setCustomId('embed_color')
    .setLabel('Цвет в hex формате')
    .setPlaceholder('#3498db или 3498db')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(7)
    .setValue(subdivision.embed_color || '');

  const row1 = new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput);
  const row2 = new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput);
  const row3 = new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput);
  const row4 = new ActionRowBuilder<TextInputBuilder>().addComponents(thumbnailInput);
  const row5 = new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput);

  modal.addComponents(row1, row2, row3, row4, row5);

  await interaction.showModal(modal);
}

export default handleDepartmentPanelButton;
