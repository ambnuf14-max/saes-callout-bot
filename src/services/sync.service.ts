import { TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentEmojiResolvable } from 'discord.js';
import discordBot from '../discord/bot';
import logger from '../utils/logger';
import {
  CalloutModel,
  SubdivisionModel,
  CalloutResponseModel,
} from '../database/models';
import { Callout, CalloutResponse, Subdivision } from '../types/database.types';
import { CalloutResponsePayload } from '../vk/utils/keyboard-builder';
import { EMOJI, CALLOUT_STATUS, MESSAGES } from '../config/constants';
import { CalloutError } from '../utils/error-handler';
import {
  logAuditEvent,
  AuditEventType,
  VkResponseReceivedData,
  TelegramResponseReceivedData,
  DiscordResponseReceivedData,
  resolveLogoThumbnailUrl,
} from '../discord/utils/audit-logger';
import { buildCalloutEmbed, addResponsesToEmbed } from '../discord/utils/embed-builder';
import { parseDiscordEmoji } from '../discord/utils/subdivision-settings-helper';
import telegramBot from '../telegram/bot';
import { formatActiveCalloutWithLog, editMessage as editTelegramMessage } from '../telegram/utils/message-sender';
import vkBot from '../vk/bot';
import { formatActiveCalloutWithLog as formatVkActiveWithLog } from '../vk/utils/message-sender';

/**
 * Сервис синхронизации между VK, Telegram и Discord
 */
export class SyncService {
  /**
   * Очередь обновлений embed/сообщений на каллаут (per calloutId).
   * Гарантирует последовательность при параллельных ответах подразделений.
   */
  private static readonly updateQueues = new Map<number, Promise<void>>();

  private static enqueueUpdate(calloutId: number, fn: () => Promise<void>): Promise<void> {
    const prev = SyncService.updateQueues.get(calloutId) ?? Promise.resolve();
    const next = prev.then(fn).catch((err) => {
      logger.error('Callout update queue error', { calloutId, error: err instanceof Error ? err.message : err });
    });
    SyncService.updateQueues.set(calloutId, next);
    next.then(() => {
      if (SyncService.updateQueues.get(calloutId) === next) {
        SyncService.updateQueues.delete(calloutId);
      }
    });
    return next;
  }
  /**
   * Обработать ответ из VK на каллаут
   */
  static async handleVkResponse(
    payload: CalloutResponsePayload,
    vkUserId: string,
    vkUserName: string
  ): Promise<CalloutResponse> {
    logger.info('Processing VK response', {
      calloutId: payload.callout_id,
      subdivisionId: payload.subdivision_id,
      vkUserId,
    });

    // 1. Проверить существование каллаута
    const callout = await CalloutModel.findById(payload.callout_id);
    if (!callout) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${payload.callout_id} не найден`,
        'CALLOUT_NOT_FOUND',
        404
      );
    }

    // 2. Проверить статус каллаута
    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${callout.id} уже закрыт`,
        'CALLOUT_ALREADY_CLOSED',
        400
      );
    }

    // 3. Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(payload.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не найдено`,
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // 4. Атомарно создать ответ (только если подразделение ещё не отвечало)
    const { response, created } = await CalloutResponseModel.createIfNotExists({
      callout_id: callout.id,
      subdivision_id: subdivision.id,
      vk_user_id: vkUserId,
      vk_user_name: vkUserName,
      platform: 'vk',
      response_type: 'acknowledged',
    });

    if (!created) {
      logger.info('Subdivision already responded to this callout', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
        vkUserId,
      });
      return response;
    }

    logger.info('VK response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      vkUserId,
    });

    // 5. Отправить уведомление в Discord (через очередь — защита от race condition)
    const calloutId1 = callout.id;
    await SyncService.enqueueUpdate(calloutId1, async () => {
      const freshCallout = await CalloutModel.findById(calloutId1);
      if (!freshCallout) return;
      await this.notifyDiscordAboutResponse(response, freshCallout, subdivision);
    }).catch((error) => {
      logger.error('Failed to notify Discord about VK response', {
        error: error instanceof Error ? error.message : error,
        responseId: response.id,
      });
    });

    return response;
  }

  /**
   * Обработать ответ из Telegram на каллаут
   */
  static async handleTelegramResponse(
    payload: CalloutResponsePayload,
    telegramUserId: string,
    telegramUserName: string
  ): Promise<CalloutResponse> {
    logger.info('Processing Telegram response', {
      calloutId: payload.callout_id,
      subdivisionId: payload.subdivision_id,
      telegramUserId,
    });

    // 1. Проверить существование каллаута
    const callout = await CalloutModel.findById(payload.callout_id);
    if (!callout) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${payload.callout_id} не найден`,
        'CALLOUT_NOT_FOUND',
        404
      );
    }

    // 2. Проверить статус каллаута
    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${callout.id} уже закрыт`,
        'CALLOUT_ALREADY_CLOSED',
        400
      );
    }

    // 3. Проверить существование подразделения
    const subdivision = await SubdivisionModel.findById(payload.subdivision_id);
    if (!subdivision) {
      throw new CalloutError(
        `${EMOJI.ERROR} Подразделение не найдено`,
        'SUBDIVISION_NOT_FOUND',
        404
      );
    }

    // 4. Атомарно создать ответ (только если подразделение ещё не отвечало)
    const { response, created } = await CalloutResponseModel.createIfNotExists({
      callout_id: callout.id,
      subdivision_id: subdivision.id,
      vk_user_id: telegramUserId,
      vk_user_name: telegramUserName,
      platform: 'telegram',
      response_type: 'acknowledged',
    });

    if (!created) {
      logger.info('Subdivision already responded to this callout', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
        telegramUserId,
      });
      return response;
    }

    logger.info('Telegram response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      telegramUserId,
    });

    // 5. Отправить уведомление в Discord (через очередь — защита от race condition)
    const calloutId2 = callout.id;
    await SyncService.enqueueUpdate(calloutId2, async () => {
      const freshCallout = await CalloutModel.findById(calloutId2);
      if (!freshCallout) return;
      await this.notifyDiscordAboutResponse(response, freshCallout, subdivision, 'telegram');
    }).catch((error) => {
      logger.error('Failed to notify Discord about Telegram response', {
        error: error instanceof Error ? error.message : error,
        responseId: response.id,
      });
    });

    return response;
  }

  /**
   * Обработать реагирование на каллаут из Discord
   */
  static async handleDiscordResponse(
    callout: Callout,
    subdivision: Subdivision,
    discordUserId: string,
    discordUserName: string
  ): Promise<{ response: CalloutResponse; changed: boolean }> {
    logger.info('Processing Discord response', {
      calloutId: callout.id,
      subdivisionId: subdivision.id,
      discordUserId,
    });

    // 1. Проверить статус каллаута
    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(
        `${EMOJI.ERROR} Каллаут #${callout.id} уже закрыт`,
        'CALLOUT_ALREADY_CLOSED',
        400
      );
    }

    // 2. Атомарно создать ответ (только если подразделение ещё не отвечало)
    const { response, created } = await CalloutResponseModel.createIfNotExists({
      callout_id: callout.id,
      subdivision_id: subdivision.id,
      vk_user_id: `discord_${discordUserId}`,
      vk_user_name: discordUserName,
      platform: 'discord',
      response_type: 'acknowledged',
    });

    if (!created) {
      logger.info('Subdivision already responded to this callout (Discord)', {
        calloutId: callout.id,
        subdivisionId: subdivision.id,
        discordUserId,
      });
      return { response, changed: false };
    }

    logger.info('Discord response saved to database', {
      responseId: response.id,
      calloutId: callout.id,
      discordUserId,
    });

    // 3. Обновить embed, уведомить VK/TG (через очередь — защита от race condition)
    const calloutId3 = callout.id;
    await SyncService.enqueueUpdate(calloutId3, async () => {
      const freshCallout = await CalloutModel.findById(calloutId3);
      if (!freshCallout) return;
      await this.notifyDiscordAboutResponse(response, freshCallout, subdivision, 'discord');
    }).catch((error) => {
      logger.error('Failed to notify about Discord response', {
        error: error instanceof Error ? error.message : error,
        responseId: response.id,
      });
    });

    return { response, changed: true };
  }

  /**
   * Отправить уведомление в Discord о реагировании из VK/Telegram/Discord
   */
  static async notifyDiscordAboutResponse(
    response: CalloutResponse,
    callout: Callout,
    subdivision: Subdivision,
    platform: 'vk' | 'telegram' | 'discord' = 'vk'
  ): Promise<void> {
    if (!callout.discord_channel_id) {
      logger.warn('No Discord channel for callout', {
        calloutId: callout.id,
      });
      return;
    }

    try {
      // Получить канал Discord
      const channel = (await discordBot.client.channels.fetch(
        callout.discord_channel_id
      )) as TextChannel;

      if (!channel || !channel.isTextBased()) {
        logger.warn('Discord channel not found or not text-based', {
          channelId: callout.discord_channel_id,
        });
        return;
      }

      // Форматировать сообщение
      const message = this.formatResponseMessage(response, subdivision, callout);

      // Отправить сообщение
      await channel.send(message);

      logger.info('Discord notified about response', {
        calloutId: callout.id,
        channelId: channel.id,
        responseId: response.id,
        platform,
      });

      // Логировать в audit log
      const responseThumbnail = resolveLogoThumbnailUrl(subdivision.logo_url);
      if (platform === 'telegram') {
        const tgAuditData: TelegramResponseReceivedData = {
          userId: response.vk_user_id,
          userName: response.vk_user_name,
          calloutId: callout.id,
          factionName: subdivision.name,
          telegramUserId: response.vk_user_id,
          telegramUserName: response.vk_user_name,
          thumbnailUrl: responseThumbnail,
          chatId: subdivision.telegram_chat_id || undefined,
          chatTitle: subdivision.telegram_chat_title || undefined,
        };
        await logAuditEvent(channel.guild, AuditEventType.TELEGRAM_RESPONSE_RECEIVED, tgAuditData);
      } else if (platform === 'discord') {
        const discordAuditData: DiscordResponseReceivedData = {
          userId: response.vk_user_id,
          userName: response.vk_user_name,
          calloutId: callout.id,
          factionName: subdivision.name,
          discordUserId: response.vk_user_id.replace('discord_', ''),
          discordUserName: response.vk_user_name,
          thumbnailUrl: responseThumbnail,
        };
        await logAuditEvent(channel.guild, AuditEventType.DISCORD_RESPONSE_RECEIVED, discordAuditData);
      } else {
        const auditData: VkResponseReceivedData = {
          userId: response.vk_user_id,
          userName: response.vk_user_name,
          calloutId: callout.id,
          factionName: subdivision.name,
          vkUserId: response.vk_user_id,
          vkUserName: response.vk_user_name,
          thumbnailUrl: responseThumbnail,
          chatId: subdivision.vk_chat_id || undefined,
          chatTitle: subdivision.vk_chat_title || undefined,
        };
        await logAuditEvent(channel.guild, AuditEventType.VK_RESPONSE_RECEIVED, auditData);
      }

      // Загрузить общие данные один раз для всех платформ
      const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
      const allSubdivisionIds = [...new Set([callout.subdivision_id, ...allResponses.map(r => r.subdivision_id)])];
      const subdivisionsMap = await SubdivisionModel.findByIds(allSubdivisionIds);
      const calloutSubdivision = subdivisionsMap.get(callout.subdivision_id);

      // Обновить embed оригинального сообщения с ответами
      if (callout.discord_message_id && calloutSubdivision) {
        try {
          const originalMessage = await channel.messages.fetch(callout.discord_message_id);
          if (originalMessage) {
            const updatedEmbed = buildCalloutEmbed(callout, calloutSubdivision);
            addResponsesToEmbed(updatedEmbed, allResponses, subdivisionsMap, callout);

            // Строка 1: "Отменить реагирование". Строка 2: "Закрыть инцидент"
            const cancelResponseButton = new ButtonBuilder()
              .setCustomId(`cancel_response_${callout.id}`)
              .setLabel('Отменить реагирование')
              .setStyle(ButtonStyle.Secondary);

            const closeButton = new ButtonBuilder()
              .setCustomId(`close_callout_${callout.id}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_CLOSE)
              .setStyle(ButtonStyle.Danger);

            await originalMessage.edit({
              embeds: [updatedEmbed],
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(cancelResponseButton),
                new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton),
              ],
            });
          }
        } catch (embedError) {
          logger.error('Failed to update original embed with responses', {
            error: embedError instanceof Error ? embedError.message : embedError,
            calloutId: callout.id,
          });
        }
      }

      // Обновить сообщение в VK — заменить клавиатуру на "Отменить реагирование"
      if (callout.vk_message_id && callout.vk_message_id !== '0' && vkBot.isActive() && calloutSubdivision?.vk_chat_id) {
        try {
          const { buildCancelResponseKeyboard: buildVkCancelKeyboard } = await import('../vk/utils/keyboard-builder');
          const vkMessage = formatVkActiveWithLog(callout, calloutSubdivision, allResponses, subdivisionsMap);
          const cancelKeyboard = buildVkCancelKeyboard(callout.id, callout.subdivision_id);
          await (vkBot.getApi().api.messages.edit as any)({
            peer_id: parseInt(calloutSubdivision.vk_chat_id),
            cmid: parseInt(callout.vk_message_id),
            message: vkMessage,
            keyboard: cancelKeyboard,
          });
        } catch (vkError) {
          logger.error('Failed to update VK message with log', {
            error: vkError instanceof Error ? vkError.message : vkError,
            calloutId: callout.id,
          });
        }
      }

      // Обновить сообщение в Telegram — заменить клавиатуру на "Отменить реагирование"
      if (callout.telegram_message_id && telegramBot.isActive() && calloutSubdivision?.telegram_chat_id) {
        try {
          const { buildCancelResponseKeyboard: buildTgCancelKeyboard } = await import('../telegram/utils/keyboard-builder');
          const tgMessage = formatActiveCalloutWithLog(callout, calloutSubdivision, allResponses, subdivisionsMap);
          await editTelegramMessage(
            telegramBot.getApi(),
            calloutSubdivision.telegram_chat_id,
            parseInt(callout.telegram_message_id),
            tgMessage,
            false,
            buildTgCancelKeyboard(callout.id, callout.subdivision_id)
          );
        } catch (tgError) {
          logger.error('Failed to update Telegram message with log', {
            error: tgError instanceof Error ? tgError.message : tgError,
            calloutId: callout.id,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to send Discord notification', {
        error: error instanceof Error ? error.message : error,
        channelId: callout.discord_channel_id,
      });
      throw error;
    }
  }

  /**
   * Форматировать сообщение об отмене реагирования для Discord
   */
  private static formatCancelResponseMessage(
    subdivision: Subdivision,
    callout: Callout,
    platform: 'vk' | 'telegram' | 'discord',
    userId: string,
    userName: string
  ): string {
    const authorMention = `<@${callout.author_id}>`;

    const parsed = subdivision.logo_url ? parseDiscordEmoji(subdivision.logo_url) : null;
    let emojiStr = '';
    if (parsed) {
      if (parsed.id) {
        emojiStr = parsed.animated
          ? `<a:${parsed.name}:${parsed.id}> `
          : `<:${parsed.name}:${parsed.id}> `;
      } else {
        emojiStr = `${parsed.name} `;
      }
    }

    const responderMention = platform === 'discord'
      ? `(<@${userId.replace('discord_', '')}>)`
      : `(${userName})`;
    return `${authorMention}, ${emojiStr}${subdivision.name} отменило реагирование на инцидент ${responderMention}.`;
  }

  /**
   * Форматировать сообщение о реагировании для Discord
   */
  private static formatResponseMessage(
    response: CalloutResponse,
    subdivision: Subdivision,
    callout: Callout,
  ): string {
    const authorMention = `<@${callout.author_id}>`;

    const parsed = subdivision.logo_url ? parseDiscordEmoji(subdivision.logo_url) : null;
    let emojiStr = '';
    if (parsed) {
      if (parsed.id) {
        emojiStr = parsed.animated
          ? `<a:${parsed.name}:${parsed.id}> `
          : `<:${parsed.name}:${parsed.id}> `;
      } else {
        emojiStr = `${parsed.name} `;
      }
    }

    const responderMention = response.platform === 'discord'
      ? `(<@${response.vk_user_id.replace('discord_', '')}>)`
      : `(${response.vk_user_name})`;
    return `${authorMention}, ${emojiStr}${subdivision.name} отреагировало на инцидент ${responderMention}.`;
  }

  /**
   * Отменить реагирование подразделения
   */
  static async handleCancelResponse(
    calloutId: number,
    subdivisionId: number,
    platform: 'vk' | 'telegram' | 'discord',
    userId: string,
    userName: string
  ): Promise<void> {
    logger.info('Processing cancel response', { calloutId, subdivisionId, platform, userId });

    const callout = await CalloutModel.findById(calloutId);
    if (!callout) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут #${calloutId} не найден`, 'CALLOUT_NOT_FOUND', 404);
    }
    if (callout.status !== CALLOUT_STATUS.ACTIVE) {
      throw new CalloutError(`${EMOJI.ERROR} Каллаут #${callout.id} уже закрыт`, 'CALLOUT_ALREADY_CLOSED', 400);
    }

    const deleted = await CalloutResponseModel.deleteByCalloutAndSubdivision(calloutId, subdivisionId);
    if (!deleted) {
      throw new CalloutError(`${EMOJI.ERROR} Реагирование не найдено`, 'RESPONSE_NOT_FOUND', 404);
    }

    logger.info('Response deleted, notifying platforms', { calloutId, subdivisionId });

    const subdivision = await SubdivisionModel.findById(subdivisionId);
    if (!subdivision) {
      logger.warn('Subdivision not found after response cancel', { subdivisionId });
      return;
    }

    await SyncService.enqueueUpdate(calloutId, async () => {
      const freshCallout = await CalloutModel.findById(calloutId);
      if (!freshCallout) return;
      await SyncService.notifyDiscordAboutResponseCancelled(freshCallout, subdivision, platform, userId, userName);
    }).catch((error) => {
      logger.error('Failed to notify about response cancellation', {
        error: error instanceof Error ? error.message : error,
        calloutId,
      });
    });
  }

  /**
   * Уведомить Discord/VK/TG об отмене реагирования (восстановить клавиатуры)
   */
  static async notifyDiscordAboutResponseCancelled(
    callout: Callout,
    subdivision: Subdivision,
    platform: 'vk' | 'telegram' | 'discord' = 'discord',
    userId: string = '',
    userName: string = ''
  ): Promise<void> {
    if (!callout.discord_channel_id) return;

    try {
      const channel = (await discordBot.client.channels.fetch(callout.discord_channel_id)) as TextChannel;
      if (!channel || !channel.isTextBased()) return;

      // Отправить сообщение об отмене (аналогично сообщению о реагировании)
      const cancelMessage = this.formatCancelResponseMessage(subdivision, callout, platform, userId, userName);
      await channel.send(cancelMessage);

      const allResponses = await CalloutResponseModel.findByCalloutId(callout.id);
      const allSubdivisionIds = [...new Set([callout.subdivision_id, ...allResponses.map(r => r.subdivision_id)])];
      const subdivisionsMap = await SubdivisionModel.findByIds(allSubdivisionIds);
      const calloutSubdivision = subdivisionsMap.get(callout.subdivision_id);

      // Обновить Discord embed + восстановить кнопку "Отреагировать"
      if (callout.discord_message_id && calloutSubdivision) {
        try {
          const originalMessage = await channel.messages.fetch(callout.discord_message_id);
          if (originalMessage) {
            const updatedEmbed = buildCalloutEmbed(callout, calloutSubdivision);
            addResponsesToEmbed(updatedEmbed, allResponses, subdivisionsMap, callout);

            // Строка 1: "Принять" + "Отклонить". Строка 2: "Закрыть инцидент"
            const respondButton = new ButtonBuilder()
              .setCustomId(`respond_callout_${callout.id}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_RESPOND_DISCORD)
              .setStyle(ButtonStyle.Secondary);

            const declineButton = new ButtonBuilder()
              .setCustomId(`decline_callout_${callout.id}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_DECLINE_DISCORD)
              .setStyle(ButtonStyle.Secondary);

            const closeButton = new ButtonBuilder()
              .setCustomId(`close_callout_${callout.id}`)
              .setLabel(MESSAGES.CALLOUT.BUTTON_CLOSE)
              .setStyle(ButtonStyle.Danger);

            await originalMessage.edit({
              embeds: [updatedEmbed],
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(respondButton, declineButton),
                new ActionRowBuilder<ButtonBuilder>().addComponents(closeButton),
              ],
            });
          }
        } catch (embedError) {
          logger.error('Failed to update Discord embed on response cancel', {
            error: embedError instanceof Error ? embedError.message : embedError,
            calloutId: callout.id,
          });
        }
      }

      // Восстановить клавиатуру в VK
      if (callout.vk_message_id && callout.vk_message_id !== '0' && vkBot.isActive() && calloutSubdivision?.vk_chat_id) {
        try {
          const { buildDetailedCalloutKeyboard: buildVkKeyboard } = await import('../vk/utils/keyboard-builder');
          const vkMessage = formatVkActiveWithLog(callout, calloutSubdivision, allResponses, subdivisionsMap);
          await (vkBot.getApi().api.messages.edit as any)({
            peer_id: parseInt(calloutSubdivision.vk_chat_id),
            cmid: parseInt(callout.vk_message_id),
            message: vkMessage,
            keyboard: buildVkKeyboard(callout.id, callout.subdivision_id),
          });
        } catch (vkError) {
          logger.error('Failed to restore VK keyboard on response cancel', {
            error: vkError instanceof Error ? vkError.message : vkError,
            calloutId: callout.id,
          });
        }
      }

      // Восстановить клавиатуру в Telegram
      if (callout.telegram_message_id && telegramBot.isActive() && calloutSubdivision?.telegram_chat_id) {
        try {
          const { buildDetailedCalloutKeyboard: buildTgKeyboard } = await import('../telegram/utils/keyboard-builder');
          const tgMessage = formatActiveCalloutWithLog(callout, calloutSubdivision, allResponses, subdivisionsMap);
          await editTelegramMessage(
            telegramBot.getApi(),
            calloutSubdivision.telegram_chat_id,
            parseInt(callout.telegram_message_id),
            tgMessage,
            false,
            buildTgKeyboard(callout.id, callout.subdivision_id)
          );
        } catch (tgError) {
          logger.error('Failed to restore Telegram keyboard on response cancel', {
            error: tgError instanceof Error ? tgError.message : tgError,
            calloutId: callout.id,
          });
        }
      }

      logger.info('Platforms notified about response cancellation', { calloutId: callout.id });
    } catch (error) {
      logger.error('Failed to notify about response cancellation', {
        error: error instanceof Error ? error.message : error,
        calloutId: callout.id,
      });
    }
  }

  /**
   * Получить статистику ответов на каллаут
   */
  static async getCalloutResponses(
    calloutId: number
  ): Promise<CalloutResponse[]> {
    return await CalloutResponseModel.findByCalloutId(calloutId);
  }

  /**
   * Получить количество фракций, ответивших на каллаут
   */
  static async getRespondedDepartmentsCount(
    calloutId: number
  ): Promise<number> {
    return await CalloutResponseModel.countUniqueSubdivisions(calloutId);
  }
}

export default SyncService;
