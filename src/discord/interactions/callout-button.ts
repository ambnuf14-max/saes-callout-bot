import {
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import logger from '../../utils/logger';
import { ServerModel } from '../../database/models';
import { EMOJI } from '../../config/constants';
import { CalloutError } from '../../utils/error-handler';
import { getSortedSubdivisions, buildBrowseMessage } from './subdivision-browse';

/**
 * Обработчик нажатия кнопки "Создать каллаут"
 */
export async function handleCreateCalloutButton(
  interaction: ButtonInteraction
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: `${EMOJI.ERROR} Эта функция доступна только на сервере`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Получить сервер из БД
    const server = await ServerModel.findByGuildId(interaction.guild.id);
    if (!server) {
      throw new CalloutError(
        `${EMOJI.ERROR} Сервер не настроен. Обратитесь к администратору.`,
        'SERVER_NOT_CONFIGURED',
        400
      );
    }

    const subdivisions = await getSortedSubdivisions(server.id);

    if (subdivisions.length === 0) {
      throw new CalloutError(
        `${EMOJI.ERROR} Нет доступных подразделений. Обратитесь к администратору.`,
        'NO_SUBDIVISIONS',
        400
      );
    }

    logger.info('Opening subdivision browse', {
      userId: interaction.user.id,
      guildId: interaction.guild.id,
      subdivisionsCount: subdivisions.length,
    });

    const message = buildBrowseMessage(subdivisions, subdivisions[0].id);
    try {
      await interaction.reply({ ...message, flags: MessageFlags.Ephemeral });
    } catch (err: any) {
      if (err?.message?.includes('COMPONENT_INVALID_EMOJI')) {
        logger.warn('Custom emoji invalid in browse menu, retrying without custom emoji', { userId: interaction.user.id });
        const safeMessage = buildBrowseMessage(subdivisions, subdivisions[0].id, true);
        await interaction.reply({ ...safeMessage, flags: MessageFlags.Ephemeral });
      } else {
        throw err;
      }
    }

    logger.info('Subdivision browse shown', {
      userId: interaction.user.id,
      subdivisionsCount: subdivisions.length,
    });
  } catch (error) {
    logger.error('Error showing subdivision select menu', {
      error: error instanceof Error ? error.message : error,
      userId: interaction.user.id,
    });

    const errorContent = error instanceof CalloutError
      ? error.message
      : `${EMOJI.ERROR} Не удалось открыть меню выбора подразделения`;

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: errorContent, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.editReply({ content: errorContent, embeds: [], components: [] }).catch(() => {});
    }
  }
}

export default handleCreateCalloutButton;
