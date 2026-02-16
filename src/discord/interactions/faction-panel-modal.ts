import { ModalSubmitInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { PendingChangeService } from '../../services/pending-change.service';
import { getLeaderFaction } from '../utils/faction-permission-checker';
import { buildSubdivisionsList, buildSubdivisionDetailPanel, buildSettingsPanel } from '../utils/faction-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик модальных окон лидерской панели
 */
export async function handleFactionPanelModal(interaction: ModalSubmitInteraction) {
  if (!interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);

  // Получить фракцию лидера
  const department = await getLeaderFaction(member);
  if (!department) {
    await interaction.reply({
      content: MESSAGES.FACTION.NO_FACTION,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const customId = interaction.customId;

  try {
    // Добавление подразделения
    if (customId === 'department_modal_add_subdivision') {
      await handleAddSubdivision(interaction, department.id, department.server_id);
    }
    // Редактирование подразделения
    else if (customId.startsWith('department_modal_edit_subdivision_')) {
      const subdivisionId = parseInt(customId.split('_')[4]);
      await handleEditSubdivision(interaction, subdivisionId, department.id);
    }
    // Настройка embed подразделения
    else if (customId.startsWith('department_modal_configure_embed_')) {
      const subdivisionId = parseInt(customId.split('_')[4]);
      await handleConfigureEmbed(interaction, subdivisionId, department.id);
    }
  } catch (error) {
    logger.error('Error handling department panel modal', {
      error: error instanceof Error ? error.message : error,
      customId,
      userId: interaction.user.id,
    });

    const content =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Произошла ошибка при обработке формы`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content });
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  }
}

/**
 * Обработка добавления подразделения
 */
async function handleAddSubdivision(
  interaction: ModalSubmitInteraction,
  departmentId: number,
  serverId: number
) {
  await interaction.deferUpdate();

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Создать pending запрос на создание подразделения
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestCreateSubdivision(
    departmentId,
    serverId,
    interaction.user.id,
    {
      name,
      description: description || undefined,
    },
    interaction.guild
  );

  logger.info('Subdivision creation requested via panel', {
    name,
    departmentId,
    userId: interaction.user.id,
  });

  // Показать список подразделений с уведомлением
  const { FactionModel } = await import('../../database/models');
  const faction = await FactionModel.findById(departmentId);
  if (!faction) {
    throw new CalloutError('Фракция не найдена', 'FACTION_NOT_FOUND', 404);
  }

  const subdivisions = await SubdivisionService.getSubdivisionsByFactionId(departmentId);
  const nonDefaultSubdivisions = subdivisions.filter(sub => !sub.is_default);

  const panel = buildSubdivisionsList(faction, nonDefaultSubdivisions);

  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на создание подразделения "${name}" отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработка редактирования подразделения
 */
async function handleEditSubdivision(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  departmentId: number
) {
  await interaction.deferUpdate();

  // Проверить что подразделение существует и принадлежит департаменту
  const existingSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!existingSubdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (existingSubdivision.faction_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Создать pending запрос на обновление подразделения
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestUpdateSubdivision(
    subdivisionId,
    departmentId,
    existingSubdivision.server_id,
    interaction.user.id,
    {
      name,
      description: description || undefined,
    },
    interaction.guild
  );

  logger.info('Subdivision update requested via panel', {
    subdivisionId,
    newName: name,
    userId: interaction.user.id,
  });

  // Показать панель подразделения с уведомлением
  const panel = await buildSubdivisionDetailPanel(existingSubdivision);

  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на обновление подразделения отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Обработка настройки embed подразделения
 */
async function handleConfigureEmbed(
  interaction: ModalSubmitInteraction,
  subdivisionId: number,
  departmentId: number
) {
  await interaction.deferUpdate();

  // Проверить что подразделение существует и принадлежит департаменту
  const existingSubdivision = await SubdivisionService.getSubdivisionById(subdivisionId);
  if (!existingSubdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  if (existingSubdivision.faction_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  // Получить значения полей
  const title = interaction.fields.getTextInputValue('embed_title').trim() || undefined;
  const description = interaction.fields.getTextInputValue('embed_description').trim() || undefined;
  const imageUrl = interaction.fields.getTextInputValue('embed_image_url').trim() || undefined;
  const thumbnailUrl = interaction.fields.getTextInputValue('embed_thumbnail_url').trim() || undefined;
  const color = interaction.fields.getTextInputValue('embed_color').trim() || undefined;

  // Валидация URL изображений
  if (imageUrl && !isValidUrl(imageUrl)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный URL основного изображения`,
      'INVALID_IMAGE_URL',
      400
    );
  }

  if (thumbnailUrl && !isValidUrl(thumbnailUrl)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный URL миниатюры`,
      'INVALID_THUMBNAIL_URL',
      400
    );
  }

  // Валидация hex цвета
  if (color && !isValidHexColor(color)) {
    throw new CalloutError(
      `${EMOJI.ERROR} Некорректный hex цвет. Используйте формат #RRGGBB или RRGGBB`,
      'INVALID_HEX_COLOR',
      400
    );
  }

  // Нормализовать цвет (добавить # если нужно)
  const normalizedColor = color && !color.startsWith('#') ? `#${color}` : color;

  // Создать pending запрос на обновление embed
  if (!interaction.guild) {
    throw new Error('Guild not found');
  }

  await PendingChangeService.requestUpdateEmbed(
    subdivisionId,
    departmentId,
    existingSubdivision.server_id,
    interaction.user.id,
    {
      embed_title: title,
      embed_description: description,
      embed_image_url: imageUrl,
      embed_thumbnail_url: thumbnailUrl,
      embed_color: normalizedColor,
    },
    interaction.guild
  );

  logger.info('Subdivision embed update requested via panel', {
    subdivisionId,
    userId: interaction.user.id,
  });

  // Показать панель настроек с уведомлением
  const panel = buildSettingsPanel(existingSubdivision);

  await interaction.editReply(panel);

  await interaction.followUp({
    content: `${EMOJI.PENDING} Запрос на обновление embed отправлен администратору`,
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Проверить корректность URL
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Проверить корректность hex цвета
 */
function isValidHexColor(color: string): boolean {
  // Поддержка форматов: #RRGGBB или RRGGBB
  const hexPattern = /^#?[0-9A-Fa-f]{6}$/;
  return hexPattern.test(color);
}

export default handleFactionPanelModal;
