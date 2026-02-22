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
  // ── Каллауты ─────────────────────────────────────────────────────────────
  {
    type: AuditEventType.CALLOUT_CREATED,
    data: {
      ...BASE,
      calloutId: 42,
      subdivisionName: 'LSPD Patrol Division',
      factionName: 'LSPD',
      description: 'Стрельба на Грув Стрит',
      channelId: '1234567890123456789',
      location: 'Грув Стрит, Лос-Сантос',
      briefDescription: 'Вооружённое столкновение банд',
      tacChannel: 'TAC-3',
      thumbnailUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
      vkStatus: '✅ Отправлено',
      telegramStatus: '✅ Отправлено',
    },
  },

  // ── Настройки сервера ─────────────────────────────────────────────────────
  {
    type: AuditEventType.SETTINGS_UPDATED,
    data: {
      ...BASE,
      changes: ['Callout канал: <#1234567890>', 'Timeout: 30 мин'],
    },
  },
  {
    type: AuditEventType.LEADER_ROLE_ADDED,
    data: { ...BASE, roleId: '1234567890123456789' },
  },
  {
    type: AuditEventType.LEADER_ROLE_REMOVED,
    data: { ...BASE, roleId: '1234567890123456789' },
  },
  {
    type: AuditEventType.CALLOUT_ROLE_ADDED,
    data: { ...BASE, roleId: '1234567890123456789' },
  },
  {
    type: AuditEventType.CALLOUT_ROLE_REMOVED,
    data: { ...BASE, roleId: '1234567890123456789' },
  },
  {
    type: AuditEventType.AUDIT_LOG_CHANNEL_SET,
    data: { ...BASE, channelId: '1234567890123456789' },
  },

  // ── Фракции ───────────────────────────────────────────────────────────────
  {
    type: AuditEventType.FACTION_CREATED,
    data: {
      ...BASE,
      factionName: 'LSPD',
      roleId: '1234567890123456789',
      description: 'Los Santos Police Department — главное полицейское управление',
      logoUrl: '🚔',
    },
  },
  {
    type: AuditEventType.FACTION_UPDATED,
    data: {
      ...BASE,
      factionName: 'LSPD',
      changes: ['Название: Los Santos Police Department', 'Логотип изменён'],
    },
  },
  {
    type: AuditEventType.FACTION_REMOVED,
    data: { ...BASE, factionName: 'FIB' },
  },

  // ── Типы фракций ──────────────────────────────────────────────────────────
  {
    type: AuditEventType.FACTION_TYPE_CREATED,
    data: {
      ...BASE,
      typeName: 'Полицейские',
      description: 'Все силовые структуры Лос-Сантоса',
    },
  },
  {
    type: AuditEventType.FACTION_TYPE_UPDATED,
    data: {
      ...BASE,
      typeName: 'Полицейские',
      changes: ['Название: Law Enforcement', 'Описание изменено'],
    },
  },
  {
    type: AuditEventType.FACTION_TYPE_DELETED,
    data: { ...BASE, typeName: 'Гражданские' },
  },
  {
    type: AuditEventType.TEMPLATE_ADDED,
    data: { ...BASE, typeName: 'Полицейские', templateName: 'Патруль' },
  },

  // ── Подразделения ─────────────────────────────────────────────────────────
  {
    type: AuditEventType.SUBDIVISION_ADDED,
    data: { ...BASE, subdivisionName: 'LSPD Patrol Division', factionName: 'LSPD' },
  },
  {
    type: AuditEventType.SUBDIVISION_UPDATED,
    data: {
      ...BASE,
      subdivisionName: 'LSPD Patrol Division',
      factionName: 'LSPD',
      changes: ['Краткое описание', 'Логотип'],
    },
  },
  {
    type: AuditEventType.SUBDIVISION_REMOVED,
    data: { ...BASE, subdivisionName: 'FIB Special Ops', factionName: 'FIB' },
  },

  // ── Интеграции: привязка ──────────────────────────────────────────────────
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

  // ── Система одобрения ─────────────────────────────────────────────────────
  {
    type: AuditEventType.CHANGE_CANCELLED,
    data: {
      ...BASE,
      changeType: 'Создание подразделения',
      factionName: 'LSPD',
      details: 'LSPD Motorcycle Unit — новое подразделение',
    },
  },
];

// ─── Разделители между группами ────────────────────────────────────────────

const SECTION_DIVIDERS: Partial<Record<AuditEventType, string>> = {
  [AuditEventType.CALLOUT_CREATED]:      '─────────────── 📋 КАЛЛАУТЫ ───────────────',
  [AuditEventType.SETTINGS_UPDATED]:     '─────────────── ⚙️ НАСТРОЙКИ СЕРВЕРА ───────────────',
  [AuditEventType.FACTION_CREATED]:      '─────────────── 🏛 ФРАКЦИИ ───────────────',
  [AuditEventType.FACTION_TYPE_CREATED]: '─────────────── 📁 ТИПЫ ФРАКЦИЙ ───────────────',
  [AuditEventType.SUBDIVISION_ADDED]:    '─────────────── 🏢 ПОДРАЗДЕЛЕНИЯ ───────────────',
  [AuditEventType.VK_CHAT_LINKED]:       '─────────────── 🔗 ИНТЕГРАЦИИ: ПРИВЯЗКА ───────────────',
  [AuditEventType.CHANGE_CANCELLED]:     '─────────────── 📝 СИСТЕМА ОДОБРЕНИЯ ───────────────',
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
