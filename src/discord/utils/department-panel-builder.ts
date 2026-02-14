import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
  ButtonStyle,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Department, Subdivision } from '../../types/database.types';
import { VerificationInstructions } from '../../types/department.types';
import { COLORS, EMOJI, MESSAGES } from '../../config/constants';

/**
 * Построить главную панель управления департаментом
 */
export function buildMainPanel(department: Department, subdivisionCount: number, activeCount: number) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${MESSAGES.DEPARTMENT.PANEL_TITLE}: ${department.name}`)
    .setDescription(department.description || 'Панель управления вашей департаментом')
    .addFields(
      {
        name: '📊 Статистика',
        value: `Подразделений: ${subdivisionCount}\nАктивных: ${activeCount}`,
        inline: true,
      },
      {
        name: '👥 Роли лидера',
        value:
          `Общая: <@&${department.general_leader_role_id}>\n` +
          `Фракция: <@&${department.department_role_id}>`,
        inline: true,
      }
    )
    .setTimestamp()
    .setFooter({ text: 'Используйте кнопки ниже для управления' });

  // Кнопки главной панели
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('department_view_subdivisions')
      .setLabel('Список подразделений')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('department_add_subdivision')
      .setLabel('Добавить подразделение')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить список подразделений
 */
export function buildSubdivisionsList(
  department: Department,
  subdivisions: Subdivision[]
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📋 Подразделения фракции: ${department.name}`)
    .setDescription(
      subdivisions.length === 0
        ? 'Подразделения еще не созданы. Нажмите "Добавить" для создания.'
        : `Всего подразделений: ${subdivisions.length}`
    )
    .setTimestamp();

  if (subdivisions.length === 0) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('department_add_subdivision')
        .setLabel('Добавить подразделение')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('department_back_main')
        .setLabel('Назад')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
  }

  // Добавить поля для каждого подразделения
  for (const subdivision of subdivisions) {
    const statusEmoji = subdivision.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
    const calloutsEmoji = subdivision.is_accepting_callouts ? '✅' : '⏸️';
    const vkEmoji = subdivision.vk_chat_id ? '✅' : '❌';

    const fieldValue =
      `**Статус:** ${statusEmoji} ${subdivision.is_active ? 'Активно' : 'Неактивно'}\n` +
      `**Прием каллаутов:** ${calloutsEmoji} ${subdivision.is_accepting_callouts ? 'Включен' : 'Отключен'}\n` +
      `**VK беседа:** ${vkEmoji} ${subdivision.vk_chat_id ? 'Привязана' : 'Не привязана'}\n` +
      (subdivision.discord_role_id ? `**Роль:** <@&${subdivision.discord_role_id}>` : '');

    embed.addFields({
      name: `${statusEmoji} ${subdivision.name}`,
      value: fieldValue,
      inline: false,
    });
  }

  // Кнопки управления
  const components: ActionRowBuilder<ButtonBuilder>[] = [];

  // Первая строка - добавить и назад
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('department_add_subdivision')
      .setLabel('Добавить')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('department_back_main')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );
  components.push(row1);

  // Вторая строка - select menu для выбора подразделения
  if (subdivisions.length > 0) {
    const options = subdivisions.map((sub) => {
      const statusEmoji = sub.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
      return new StringSelectMenuOptionBuilder()
        .setLabel(sub.name)
        .setValue(sub.id.toString())
        .setDescription(
          sub.is_accepting_callouts ? 'Принимает каллауты' : 'Не принимает каллауты'
        )
        .setEmoji(statusEmoji);
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('department_select_subdivision')
      .setPlaceholder('Выберите подразделение для управления')
      .addOptions(options);

    const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
    components.push(row2 as any);
  }

  return { embeds: [embed], components };
}

/**
 * Построить детальную панель управления подразделением
 */
export function buildSubdivisionDetailPanel(subdivision: Subdivision) {
  const statusEmoji = subdivision.is_active ? EMOJI.ACTIVE : EMOJI.ERROR;
  const calloutsStatus = subdivision.is_accepting_callouts ? 'Включен' : 'Отключен';
  const vkStatus = subdivision.vk_chat_id ? 'Привязана' : 'Не привязана';

  const embed = new EmbedBuilder()
    .setColor(subdivision.is_active ? COLORS.ACTIVE : COLORS.ERROR)
    .setTitle(`${statusEmoji} Управление: ${subdivision.name}`)
    .addFields(
      {
        name: '📊 Статус',
        value: subdivision.is_active ? 'Активно' : 'Неактивно',
        inline: true,
      },
      {
        name: '📞 Прием каллаутов',
        value: calloutsStatus,
        inline: true,
      },
      {
        name: '💬 VK беседа',
        value: vkStatus,
        inline: true,
      }
    )
    .setTimestamp();

  if (subdivision.description) {
    embed.addFields({
      name: 'Описание',
      value: subdivision.description,
    });
  }

  if (subdivision.discord_role_id) {
    embed.addFields({
      name: 'Discord роль',
      value: `<@&${subdivision.discord_role_id}>`,
      inline: true,
    });
  }

  // Кнопки управления подразделением
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`department_edit_sub_${subdivision.id}`)
      .setLabel('Изменить')
      .setEmoji('📝')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`department_link_vk_${subdivision.id}`)
      .setLabel(subdivision.vk_chat_id ? 'Перепривязать VK' : 'Привязать VK')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`department_toggle_callouts_${subdivision.id}`)
      .setLabel(subdivision.is_accepting_callouts ? 'Отключить каллауты' : 'Включить каллауты')
      .setEmoji(subdivision.is_accepting_callouts ? '⏸️' : '▶️')
      .setStyle(subdivision.is_accepting_callouts ? ButtonStyle.Secondary : ButtonStyle.Success)
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`department_delete_sub_${subdivision.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('department_back_list')
      .setLabel('Назад к списку')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

/**
 * Построить embed с инструкциями верификации VK
 */
export function buildVerificationInstructions(instructions: VerificationInstructions) {
  const minutes = Math.ceil(
    (instructions.expiresAt.getTime() - Date.now()) / 60000
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`${MESSAGES.VERIFICATION.TITLE}: ${instructions.subdivisionName}`)
    .setDescription(MESSAGES.VERIFICATION.INSTRUCTIONS(instructions.token, minutes))
    .addFields({
      name: '🔑 Токен',
      value: `\`\`\`${instructions.token}\`\`\``,
    })
    .setTimestamp()
    .setFooter({ text: `Токен действителен ${minutes} минут` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('department_back_subdivision')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить embed подтверждения удаления подразделения
 */
export function buildDeleteConfirmation(subdivision: Subdivision) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.WARNING)
    .setTitle(`${EMOJI.WARNING} Подтверждение удаления`)
    .setDescription(
      `Вы действительно хотите удалить подразделение **${subdivision.name}**?\n\n` +
        `⚠️ **Внимание:** Это действие необратимо!`
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`department_confirm_delete_${subdivision.id}`)
      .setLabel('Удалить')
      .setEmoji('🗑️')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('department_cancel_delete')
      .setLabel('Отмена')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Построить пустой список (нет подразделений)
 */
export function buildEmptySubdivisionsList(department: Department) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.INFO)
    .setTitle(`📋 Подразделения фракции: ${department.name}`)
    .setDescription(
      'Подразделения еще не созданы.\n\n' +
        'Создайте первое подразделение нажав кнопку "Добавить подразделение"'
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('department_add_subdivision')
      .setLabel('Добавить подразделение')
      .setEmoji('➕')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('department_back_main')
      .setLabel('Назад')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

export default {
  buildMainPanel,
  buildSubdivisionsList,
  buildSubdivisionDetailPanel,
  buildVerificationInstructions,
  buildDeleteConfirmation,
  buildEmptySubdivisionsList,
};
