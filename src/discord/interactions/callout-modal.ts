import { ModalSubmitInteraction } from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import DepartmentService from '../../services/department.service';
import CalloutService from '../../services/callout.service';
import CalloutGatewayService from '../../services/callout-gateway.service';
import { EMOJI, MESSAGES } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';

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
    const departmentInput = interaction.fields.getTextInputValue('department_input');
    const description = interaction.fields.getTextInputValue('description_input');

    logger.info('Processing callout modal submit', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      departmentInput,
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

    // Получить роли пользователя
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const userRoles = member.roles.cache.map((role) => role.id);

    // Проверить права на создание каллаута
    const permissionCheck = await CalloutGatewayService.canUserCreateCallout(
      interaction.user.id,
      userRoles,
      server.id
    );

    if (!permissionCheck.allowed) {
      await interaction.editReply({
        content: permissionCheck.reason || `${EMOJI.ERROR} Недостаточно прав для создания каллаута`,
      });
      return;
    }

    // Найти департамент по названию
    const department = await DepartmentService.getDepartmentByName(
      server.id,
      departmentInput.trim()
    );

    if (!department) {
      throw new CalloutError(
        `${EMOJI.ERROR} Департамент "${departmentInput}" не найден. Доступные: ${(
          await DepartmentService.getDepartments(server.id, true)
        )
          .map((d) => d.name)
          .join(', ')}`,
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

    // Создать каллаут через сервис
    const { callout, channel } = await CalloutService.createCallout(
      interaction.guild,
      {
        server_id: server.id,
        department_id: department.id,
        author_id: interaction.user.id,
        author_name: interaction.user.tag,
        description: description.trim(),
      }
    );

    logger.info('Callout created successfully', {
      calloutId: callout.id,
      channelId: channel.id,
      userId: interaction.user.id,
      departmentId: department.id,
    });

    // Записать время создания каллаута для rate limiting
    await CalloutGatewayService.recordCalloutCreation(interaction.user.id, server.id);

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
  }
}

export default handleCalloutModalSubmit;
