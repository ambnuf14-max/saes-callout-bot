import { ModalSubmitInteraction, MessageFlags } from 'discord.js';
import logger from '../../utils/logger';
import { SubdivisionService } from '../../services/subdivision.service';
import { getLeaderDepartment } from '../utils/department-permission-checker';
import { buildSubdivisionsList, buildSubdivisionDetailPanel } from '../utils/department-panel-builder';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

/**
 * Обработчик модальных окон лидерской панели
 */
export async function handleDepartmentPanelModal(interaction: ModalSubmitInteraction) {
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

  // Создать подразделение
  const subdivision = await SubdivisionService.createSubdivision({
    department_id: departmentId,
    server_id: serverId,
    name: name,
    description: description || undefined,
  });

  logger.info('Subdivision created via panel', {
    subdivisionId: subdivision.id,
    name: subdivision.name,
    departmentId,
    userId: interaction.user.id,
  });

  // Показать детальную панель нового подразделения
  const panel = buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);
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

  if (existingSubdivision.department_id !== departmentId) {
    throw new CalloutError(
      `${EMOJI.ERROR} У вас нет прав на управление этим подразделением`,
      'PERMISSION_DENIED',
      403
    );
  }

  const name = interaction.fields.getTextInputValue('subdivision_name').trim();
  const description = interaction.fields.getTextInputValue('subdivision_description').trim();

  // Обновить подразделение
  const subdivision = await SubdivisionService.updateSubdivision(subdivisionId, {
    name: name,
    description: description || undefined,
  });

  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  logger.info('Subdivision updated via panel', {
    subdivisionId,
    name: subdivision.name,
    userId: interaction.user.id,
  });

  // Показать обновленную панель подразделения
  const panel = buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);
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

  if (existingSubdivision.department_id !== departmentId) {
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

  // Обновить подразделение
  const subdivision = await SubdivisionService.updateSubdivision(subdivisionId, {
    embed_title: title,
    embed_description: description,
    embed_image_url: imageUrl,
    embed_thumbnail_url: thumbnailUrl,
    embed_color: normalizedColor,
  });

  if (!subdivision) {
    throw new CalloutError('Подразделение не найдено', 'SUBDIVISION_NOT_FOUND', 404);
  }

  logger.info('Subdivision embed configured via panel', {
    subdivisionId,
    userId: interaction.user.id,
  });

  // Показать обновленную панель подразделения
  const panel = buildSubdivisionDetailPanel(subdivision);

  await interaction.editReply(panel);
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

export default handleDepartmentPanelModal;
