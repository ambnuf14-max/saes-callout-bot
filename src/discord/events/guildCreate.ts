import { Guild } from 'discord.js';
import logger from '../../utils/logger';
import { isAuthorizedGuild } from '../utils/guild-guard';

const GRACE_PERIOD_MS = 10 * 60 * 1000; // 10 минут

/**
 * Обработчик события guildCreate.
 * Если сервер не главный и не привязанный faction-сервер —
 * даёт 10 минут на выполнение /link, затем покидает.
 */
export default async function guildCreateHandler(guild: Guild): Promise<void> {
  try {
    const authorized = await isAuthorizedGuild(guild.id);
    if (authorized) return;

    logger.warn('Bot added to unauthorized guild, starting grace period', {
      guildId: guild.id,
      guildName: guild.name,
    });

    // Уведомить в системном канале
    const systemChannel = guild.systemChannel;
    if (systemChannel?.permissionsFor(guild.members.me!)?.has('SendMessages')) {
      await systemChannel.send(
        `👋 Привет! Этот бот работает только на авторизованных серверах.\n\n` +
        `Если вы администратор фракционного сервера — запустите \`/link TOKEN\` ` +
        `в течение **10 минут**, чтобы привязать этот сервер к фракции.\n\n` +
        `Если токен не введён — бот автоматически покинет сервер.`
      ).catch(() => {});
    }

    // Grace period — ждём /link
    setTimeout(async () => {
      try {
        const stillUnauthorized = !(await isAuthorizedGuild(guild.id));
        if (stillUnauthorized) {
          logger.info('Grace period expired, leaving unauthorized guild', {
            guildId: guild.id,
            guildName: guild.name,
          });
          await guild.leave();
        }
      } catch (err) {
        logger.error('Error during grace period leave', {
          guildId: guild.id,
          error: err instanceof Error ? err.message : err,
        });
      }
    }, GRACE_PERIOD_MS);
  } catch (err) {
    logger.error('Error in guildCreate handler', {
      guildId: guild.id,
      error: err instanceof Error ? err.message : err,
    });
  }
}
