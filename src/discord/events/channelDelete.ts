import { DMChannel, NonThreadGuildBasedChannel } from 'discord.js';
import logger from '../../utils/logger';
import { CalloutModel } from '../../database/models';
import { CalloutService } from '../../services/callout.service';
import { CALLOUT_STATUS } from '../../config/constants';

/**
 * Обработчик события удаления канала.
 * Если удалённый канал является каналом активного инцидента — закрывает каллаут.
 */
export default async function channelDeleteHandler(
  channel: DMChannel | NonThreadGuildBasedChannel
): Promise<void> {
  if (!('guild' in channel)) return;

  try {
    const callout = await CalloutModel.findByChannelId(channel.id);
    if (!callout || callout.status !== CALLOUT_STATUS.ACTIVE) return;

    logger.info('Incident channel deleted, closing callout', {
      calloutId: callout.id,
      channelId: channel.id,
      guildId: channel.guild.id,
    });

    await CalloutService.closeCallout(
      channel.guild,
      callout.id,
      'system',
      'Инцидент закрыт в связи с удалением канала'
    );

    logger.info('Callout closed due to channel deletion', { calloutId: callout.id });
  } catch (error) {
    logger.error('Failed to close callout on channel deletion', {
      channelId: channel.id,
      error: error instanceof Error ? error.message : error,
    });
  }
}
