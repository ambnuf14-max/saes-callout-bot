/**
 * Скрипт предпросмотра audit log эмбедов.
 * Шлёт все типы событий с тестовыми данными в указанный канал Discord.
 *
 * Использование:
 *   npx ts-node scripts/preview-audit-embeds.ts <CHANNEL_ID>
 *
 * Или добавить в package.json:
 *   "preview:audit": "ts-node scripts/preview-audit-embeds.ts"
 * и запускать:
 *   npm run preview:audit -- <CHANNEL_ID>
 */

import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, TextChannel, EmbedBuilder } from 'discord.js';
import { buildAuditEmbed, AuditEventType } from '../src/discord/utils/audit-logger';

const CHANNEL_ID = process.argv[2];
if (!CHANNEL_ID) {
  console.error('❌ Укажи ID канала: npx ts-node scripts/preview-audit-embeds.ts <CHANNEL_ID>');
  process.exit(1);
}

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN не найден в .env');
  process.exit(1);
}

// ─── Тестовые данные ──────────────────────────────────────────────────────

const BASE = { userId: '123456789012345678', userName: 'TestUser' };

const PREVIEW_EVENTS: Array<{
  type: AuditEventType;
  data: Parameters<typeof buildAuditEmbed>[1];
}> = [
  // ── Статус ботов ────────────────────────────────────────────────────────
  {
    type: AuditEventType.BOT_CONNECTED,
    data: { userId: 'system', userName: 'Система', platform: 'VK', mode: 'Long Poll' },
  },
  {
    type: AuditEventType.BOT_CONNECTED,
    data: { userId: 'system', userName: 'Система', platform: 'Telegram', mode: 'Long Poll' },
  },
  {
    type: AuditEventType.BOT_CONNECTION_FAILED,
    data: {
      userId: 'system', userName: 'Система', platform: 'VK',
      errorMessage: 'VkError [5]: User authorization failed: invalid access_token (4)',
    },
  },
  {
    type: AuditEventType.BOT_CONNECTION_FAILED,
    data: {
      userId: 'system', userName: 'Система', platform: 'Telegram',
      errorMessage: 'ETELEGRAM: 401 Unauthorized',
    },
  },

  // ── Реагирование (добавлены chatId) ─────────────────────────────────────
  {
    type: AuditEventType.VK_RESPONSE_RECEIVED,
    data: {
      ...BASE,
      calloutId: 42,
      factionName: 'LSPD Patrol Division',
      vkUserId: '7654321',
      vkUserName: 'Ivan Petrov',
      chatId: '2000000001',
      chatTitle: 'LSPD | Patrol беседа',
      thumbnailUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
    },
  },
  {
    type: AuditEventType.TELEGRAM_RESPONSE_RECEIVED,
    data: {
      ...BASE,
      calloutId: 42,
      factionName: 'LSPD Patrol Division',
      telegramUserId: '9876543',
      telegramUserName: 'Aleksey Smirnov',
      chatId: '-1001234567890',
      chatTitle: 'FIB | Special Ops группа',
      thumbnailUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
    },
  },

  // ── Интеграции: привязка (добавлен thumbnail платформы) ─────────────────
  {
    type: AuditEventType.VK_CHAT_LINKED,
    data: {
      ...BASE,
      subdivisionName: 'LSPD Patrol Division',
      factionName: 'LSPD',
      vkChatId: '2000000001',
      chatTitle: 'LSPD | Patrol беседа',
    },
  },
  {
    type: AuditEventType.TELEGRAM_CHAT_LINKED,
    data: {
      ...BASE,
      subdivisionName: 'FIB Special Ops',
      factionName: 'FIB',
      telegramChatId: '-1001234567890',
      chatTitle: 'FIB | Special Ops группа',
    },
  },

  // ── Интеграции: отвязка (добавлен thumbnail платформы) ──────────────────
  {
    type: AuditEventType.VK_CHAT_UNLINKED,
    data: {
      ...BASE,
      subdivisionName: 'LSPD Patrol Division',
      factionName: 'LSPD',
      chatId: '2000000001',
      chatTitle: 'LSPD | Patrol беседа',
    },
  },
  {
    type: AuditEventType.TELEGRAM_CHAT_UNLINKED,
    data: {
      ...BASE,
      subdivisionName: 'FIB Special Ops',
      factionName: 'FIB',
      chatId: '-1001234567890',
      chatTitle: 'FIB | Special Ops группа',
    },
  },

  // ── Ошибки уведомлений (добавлены chatId) ───────────────────────────────
  {
    type: AuditEventType.VK_NOTIFICATION_FAILED,
    data: {
      ...BASE,
      userId: 'system',
      userName: 'Система',
      calloutId: 44,
      subdivisionName: 'LSPD Patrol Division',
      errorMessage: 'VkError [100]: One of the parameters specified was missing or invalid: peer_id is incorrect, chat not found',
      chatId: '2000000001',
      chatTitle: 'LSPD | Patrol беседа',
    },
  },
  {
    type: AuditEventType.TELEGRAM_NOTIFICATION_FAILED,
    data: {
      ...BASE,
      userId: 'system',
      userName: 'Система',
      calloutId: 44,
      subdivisionName: 'FIB Special Ops',
      errorMessage: 'ETELEGRAM: 400 Bad Request: chat not found',
      chatId: '-1001234567890',
      chatTitle: 'FIB | Special Ops группа',
    },
  },
];

// ─── Разделители между группами ────────────────────────────────────────────

const SECTION_DIVIDERS: Partial<Record<AuditEventType, string>> = {
  [AuditEventType.BOT_CONNECTED]:          '─────────────── 🤖 СТАТУС БОТОВ ───────────────',
  [AuditEventType.VK_RESPONSE_RECEIVED]:   '─────────────── 📣 РЕАГИРОВАНИЕ ───────────────',
  [AuditEventType.VK_CHAT_LINKED]:         '─────────────── 🔗 ИНТЕГРАЦИИ: ПРИВЯЗКА ───────────────',
  [AuditEventType.VK_CHAT_UNLINKED]:       '─────────────── 🔗 ИНТЕГРАЦИИ: ОТВЯЗКА ───────────────',
  [AuditEventType.VK_NOTIFICATION_FAILED]: '─────────────── ❌ ОШИБКИ УВЕДОМЛЕНИЙ ───────────────',
};

// ─── Основной скрипт ───────────────────────────────────────────────────────

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  await client.login(TOKEN);

  client.once('ready', async () => {
    console.log(`✅ Бот подключён как ${client.user!.tag}`);

    const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error(`❌ Канал ${CHANNEL_ID} не найден или не текстовый`);
      client.destroy();
      process.exit(1);
    }

    const textChannel = channel as TextChannel;
    console.log(`📨 Отправка в #${textChannel.name} (${CHANNEL_ID})`);
    console.log(`   Всего событий: ${PREVIEW_EVENTS.length}`);

    let sent = 0;
    for (const { type, data } of PREVIEW_EVENTS) {
      // Разделитель перед группой
      const divider = SECTION_DIVIDERS[type];
      if (divider) {
        await textChannel.send({ content: `\`\`\`\n${divider}\n\`\`\`` });
        await sleep(400);
      }

      const embed = buildAuditEmbed(type, data);
      await textChannel.send({ embeds: [embed] });
      sent++;
      process.stdout.write(`\r   Отправлено: ${sent}/${PREVIEW_EVENTS.length}`);
      await sleep(300);
    }

    console.log(`\n✅ Готово! Все ${sent} эмбедов отправлены.`);
    client.destroy();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});
