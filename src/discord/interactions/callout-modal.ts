import { ModalSubmitInteraction } from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel, DepartmentModel } from '../../database/models';
import CalloutService from '../../services/callout.service';
import CalloutGatewayService from '../../services/callout-gateway.service';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { isAdministrator } from '../utils/permission-checker';
import {
  getDepartmentSelection,
  clearDepartmentSelection,
} from './department-select';

/**
 * Обработчик submit модального окна создания каллаута
 */
export async function handleCalloutModalSubmit(
  interaction: ModalSubmitInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      ephemeral: true,
    });
    return;
  }

  // Отложенный ответ, так как создание канала может занять время
  await interaction.deferReply({ ephemeral: true });

  try {
    // Получить данные из модального окна
    const location = interaction.fields.getTextInputValue('location_input');
    const description = interaction.fields.getTextInputValue('description_input');

    // Получить департамент из временного хранилища
    const departmentId = getDepartmentSelection(interaction.user.id);

    if (!departmentId) {
      throw new CalloutError(
        `${EMOJI.ERROR} Выбор департамента истек. Попробуйте снова.`,
        'DEPARTMENT_SELECTION_EXPIRED',
        400
      );
    }

    logger.info('Processing callout modal submit', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      departmentId,
      location,
      descriptionLength: description.length,
    });

    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) {
      throw new CalloutError(
        `${EMOJI.ERROR} Сервер не настроен`,
        'SERVER_NOT_CONFIGURED',
        400
      );
    }

    // Получить департамент по ID
    const department = await DepartmentModel.findById(departmentId);

    if (!department) {
      throw new CalloutError(
        `${EMOJI.ERROR} Департамент не найден`,
        'DEPARTMENT_NOT_FOUND',
        404
      );
    }

    if (!department.is_active) {
      throw new CalloutError(
        `${EMOJI.ERROR} Департамент ${department.name} временно неактивен`,
        'DEPARTMENT_INACTIVE',
        400
      );
    }

    // Получить роли пользователя
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const userRoles = member.roles.cache.map((role) => role.id);
    const isAdmin = isAdministrator(member);

    // Проверить права на создание каллаута (администраторы игнорируют проверки)
    const permissionCheck = await CalloutGatewayService.canUserCreateCallout(
      interaction.user.id,
      userRoles,
      server.id,
      isAdmin
    );

    if (!permissionCheck.allowed) {
      // Очистить временное хранилище перед выходом
      clearDepartmentSelection(interaction.user.id);
      await interaction.editReply({
        content: permissionCheck.reason || `${EMOJI.ERROR} Недостаточно прав`,
      });
      return;
    }

    // Создать каллаут через сервис (с location!)
    const { callout, channel } = await CalloutService.createCallout(
      interaction.guild,
      {
        server_id: server.id,
        department_id: department.id,
        author_id: interaction.user.id,
        author_name: interaction.user.tag,
        description: description.trim(),
        location: location.trim(),
      }
    );

    logger.info('Callout created successfully', {
      calloutId: callout.id,
      channelId: channel.id,
      userId: interaction.user.id,
      departmentId: department.id,
      location,
    });

    // Очистить временное хранилище
    clearDepartmentSelection(interaction.user.id);

    // Записать время создания каллаута для rate limiting (администраторы не учитываются)
    await CalloutGatewayService.recordCalloutCreation(interaction.user.id, server.id, isAdmin);

    // Отправить подтверждение пользователю
    await interaction.editReply({
      content: MESSAGES.CALLOUT.SUCCESS_CREATED(channel.toString()),
    });
  } catch (error) {
    logger.error('Error processing callout modal', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
      guildId: interaction.guild.id,
    });

    const errorMessage =
      error instanceof CalloutError
        ? error.message
        : `${EMOJI.ERROR} Не удалось создать каллаут. Попробуйте позже.`;

    await interaction.editReply({
      content: errorMessage,
    });

    // Очистить временное хранилище даже при ошибке
    clearDepartmentSelection(interaction.user.id);
  }
}

export default handleCalloutModalSubmit;
