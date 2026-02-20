import {
  FactionType,
  CreateFactionTypeDTO,
  UpdateFactionTypeDTO,
  UpdateFactionTypeEmbedDTO,
  SubdivisionTemplate,
  CreateSubdivisionTemplateDTO,
  UpdateSubdivisionTemplateDTO,
  FactionTypeWithTemplates,
  Subdivision,
} from '../types/database.types';
import FactionTypeModel from '../database/models/FactionType';
import SubdivisionTemplateModel from '../database/models/SubdivisionTemplate';
import SubdivisionModel from '../database/models/Subdivision';
import { CalloutError } from '../utils/error-handler';
import logger from '../utils/logger';

/**
 * Сервис для работы с типами фракций
 */
export class FactionTypeService {
  /**
   * Создать новый тип фракции
   */
  static async createFactionType(data: CreateFactionTypeDTO): Promise<FactionType> {
    // Проверить уникальность названия
    const exists = await FactionTypeModel.exists(data.server_id, data.name);
    if (exists) {
      throw new CalloutError(
        `Тип фракции "${data.name}" уже существует`,
        'FACTION_TYPE_EXISTS',
        400
      );
    }

    // Валидация названия
    if (data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название типа должно быть от 2 до 50 символов',
        'INVALID_NAME_LENGTH',
        400
      );
    }

    return await FactionTypeModel.create(data);
  }

  /**
   * Получить все типы фракций сервера
   */
  static async getFactionTypes(serverId: number, activeOnly = true): Promise<FactionType[]> {
    return await FactionTypeModel.findByServerId(serverId, activeOnly);
  }

  /**
   * Получить тип фракции по ID
   */
  static async getFactionTypeById(id: number): Promise<FactionType | undefined> {
    return await FactionTypeModel.findById(id);
  }

  /**
   * Обновить тип фракции
   */
  static async updateFactionType(
    id: number,
    data: UpdateFactionTypeDTO
  ): Promise<FactionType | undefined> {
    const type = await FactionTypeModel.findById(id);
    if (!type) {
      throw new CalloutError('Тип фракции не найден', 'TYPE_NOT_FOUND', 404);
    }

    // Проверить уникальность названия если оно меняется
    if (data.name && data.name !== type.name) {
      const exists = await FactionTypeModel.exists(type.server_id, data.name);
      if (exists) {
        throw new CalloutError(
          `Тип фракции "${data.name}" уже существует`,
          'FACTION_TYPE_EXISTS',
          400
        );
      }
    }

    // Валидация названия
    if (data.name && (data.name.length < 2 || data.name.length > 50)) {
      throw new CalloutError(
        'Название типа должно быть от 2 до 50 символов',
        'INVALID_NAME_LENGTH',
        400
      );
    }

    return await FactionTypeModel.update(id, data);
  }

  /**
   * Удалить тип фракции
   */
  static async deleteFactionType(id: number): Promise<void> {
    const type = await FactionTypeModel.findById(id);
    if (!type) {
      throw new CalloutError('Тип фракции не найден', 'TYPE_NOT_FOUND', 404);
    }

    // Проверить, что нет фракций этого типа
    // (реализация в FactionModel.findByTypeId если нужно)

    await FactionTypeModel.delete(id);
  }

  /**
   * Добавить шаблон подразделения к типу
   */
  static async addTemplate(
    typeId: number,
    data: CreateSubdivisionTemplateDTO
  ): Promise<SubdivisionTemplate> {
    const type = await FactionTypeModel.findById(typeId);
    if (!type) {
      throw new CalloutError('Тип фракции не найден', 'TYPE_NOT_FOUND', 404);
    }

    // Валидация названия
    if (data.name.length < 2 || data.name.length > 50) {
      throw new CalloutError(
        'Название подразделения должно быть от 2 до 50 символов',
        'INVALID_NAME_LENGTH',
        400
      );
    }

    // Валидация цвета если указан
    if (data.embed_color && !this.isValidHexColor(data.embed_color)) {
      throw new CalloutError(
        'Неверный формат цвета. Используйте hex формат (например, #FF0000)',
        'INVALID_COLOR_FORMAT',
        400
      );
    }

    return await SubdivisionTemplateModel.create({
      ...data,
      faction_type_id: typeId,
    });
  }

  /**
   * Обновить шаблон подразделения
   */
  static async updateTemplate(
    templateId: number,
    data: UpdateSubdivisionTemplateDTO
  ): Promise<SubdivisionTemplate | undefined> {
    const template = await SubdivisionTemplateModel.findById(templateId);
    if (!template) {
      throw new CalloutError('Шаблон подразделения не найден', 'TEMPLATE_NOT_FOUND', 404);
    }

    // Валидация названия если оно меняется
    if (data.name && (data.name.length < 2 || data.name.length > 50)) {
      throw new CalloutError(
        'Название подразделения должно быть от 2 до 50 символов',
        'INVALID_NAME_LENGTH',
        400
      );
    }

    // Валидация цвета если он меняется
    if (data.embed_color && !this.isValidHexColor(data.embed_color)) {
      throw new CalloutError(
        'Неверный формат цвета. Используйте hex формат (например, #FF0000)',
        'INVALID_COLOR_FORMAT',
        400
      );
    }

    return await SubdivisionTemplateModel.update(templateId, data);
  }

  /**
   * Удалить шаблон подразделения
   */
  static async deleteTemplate(templateId: number): Promise<void> {
    const template = await SubdivisionTemplateModel.findById(templateId);
    if (!template) {
      throw new CalloutError('Шаблон подразделения не найден', 'TEMPLATE_NOT_FOUND', 404);
    }

    await SubdivisionTemplateModel.delete(templateId);
  }

  /**
   * Получить тип с шаблонами
   */
  static async getTypeWithTemplates(typeId: number): Promise<FactionTypeWithTemplates | undefined> {
    return await FactionTypeModel.findWithTemplates(typeId);
  }

  /**
   * Создать подразделения из шаблонов типа
   * Вызывается при создании фракции с типом
   */
  static async instantiateTemplates(
    factionId: number,
    typeId: number,
    serverId: number
  ): Promise<Subdivision[]> {
    const templates = await SubdivisionTemplateModel.findByFactionTypeId(typeId);

    logger.info('Instantiating subdivision templates', {
      factionId,
      typeId,
      templateCount: templates.length,
    });

    if (templates.length === 0) {
      // Если нет шаблонов - дефолтное подразделение уже создано в Faction.create()
      // Применить embed-настройки типа к дефолтному подразделению (если заданы)
      const factionType = await FactionTypeModel.findById(typeId);
      if (factionType && this.hasTypeEmbedSettings(factionType)) {
        const defaultSub = await SubdivisionModel.findDefaultByFactionId(factionId);
        if (defaultSub) {
          await SubdivisionModel.update(defaultSub.id, {
            embed_author_name: factionType.embed_author_name || undefined,
            embed_author_url: factionType.embed_author_url || undefined,
            embed_author_icon_url: factionType.embed_author_icon_url || undefined,
            embed_title: factionType.embed_title || undefined,
            embed_title_url: factionType.embed_title_url || undefined,
            embed_description: factionType.embed_description || undefined,
            embed_color: factionType.embed_color || undefined,
            embed_image_url: factionType.embed_image_url || undefined,
            embed_thumbnail_url: factionType.embed_thumbnail_url || undefined,
            embed_footer_text: factionType.embed_footer_text || undefined,
            embed_footer_icon_url: factionType.embed_footer_icon_url || undefined,
            short_description: factionType.short_description || undefined,
            logo_url: factionType.logo_url || undefined,
          });
          logger.debug('Applied faction type embed settings to default subdivision', {
            factionId,
            typeId,
            subdivisionId: defaultSub.id,
          });
        }
      }
      logger.debug('No templates found, keeping default subdivision');
      return [];
    }

    // Удалить дефолтное подразделение (т.к. создаем шаблонные)
    const defaultSub = await SubdivisionModel.findDefaultByFactionId(factionId);
    if (defaultSub) {
      await SubdivisionModel.delete(defaultSub.id);
      logger.debug('Deleted default subdivision', { subdivisionId: defaultSub.id });
    }

    // Создать подразделения из шаблонов
    const subdivisions: Subdivision[] = [];
    const sortedTemplates = templates.sort((a, b) => a.display_order - b.display_order);

    for (const template of sortedTemplates) {
      const subdivision = await SubdivisionModel.create({
        faction_id: factionId,
        server_id: serverId,
        name: template.name,
        description: template.description || undefined,
        discord_role_id: template.discord_role_id || undefined,
      });

      // Обновить embed настройки если они есть в шаблоне
      if (this.hasEmbedSettings(template)) {
        await SubdivisionModel.update(subdivision.id, {
          embed_author_name: template.embed_author_name || undefined,
          embed_author_url: template.embed_author_url || undefined,
          embed_author_icon_url: template.embed_author_icon_url || undefined,
          embed_title: template.embed_title || undefined,
          embed_description: template.embed_description || undefined,
          embed_color: template.embed_color || undefined,
          embed_image_url: template.embed_image_url || undefined,
          embed_thumbnail_url: template.embed_thumbnail_url || undefined,
          embed_footer_text: template.embed_footer_text || undefined,
          embed_footer_icon_url: template.embed_footer_icon_url || undefined,
        });
      }

      // Скопировать short_description и logo_url если есть
      if (template.short_description || template.logo_url) {
        await SubdivisionModel.update(subdivision.id, {
          short_description: template.short_description || undefined,
          logo_url: template.logo_url || undefined,
        });
      }

      subdivisions.push(subdivision);
      logger.debug('Created subdivision from template', {
        subdivisionId: subdivision.id,
        templateId: template.id,
        name: template.name,
      });
    }

    logger.info('Subdivision templates instantiated', {
      factionId,
      createdCount: subdivisions.length,
    });

    return subdivisions;
  }

  /**
   * Проверить, есть ли embed настройки в шаблоне
   */
  private static hasEmbedSettings(template: SubdivisionTemplate): boolean {
    return !!(
      template.embed_title ||
      template.embed_description ||
      template.embed_color ||
      template.embed_image_url ||
      template.embed_thumbnail_url ||
      template.embed_author_name ||
      template.embed_footer_text
    );
  }

  /**
   * Проверить, есть ли embed-настройки в типе фракции
   */
  private static hasTypeEmbedSettings(type: FactionType): boolean {
    return !!(
      type.embed_title || type.embed_description || type.embed_color ||
      type.embed_image_url || type.embed_thumbnail_url || type.embed_author_name ||
      type.embed_footer_text || type.logo_url || type.short_description ||
      type.embed_author_url || type.embed_author_icon_url || type.embed_title_url ||
      type.embed_footer_icon_url
    );
  }

  /**
   * Обновить embed-настройки типа фракции
   */
  static async updateFactionTypeEmbed(
    id: number,
    data: UpdateFactionTypeEmbedDTO
  ): Promise<FactionType | undefined> {
    const type = await FactionTypeModel.findById(id);
    if (!type) {
      throw new CalloutError('Тип фракции не найден', 'TYPE_NOT_FOUND', 404);
    }

    if (data.embed_color && !this.isValidHexColor(data.embed_color)) {
      throw new CalloutError(
        'Неверный формат цвета. Используйте hex (например, #FF0000)',
        'INVALID_COLOR_FORMAT',
        400
      );
    }

    return await FactionTypeModel.updateEmbed(id, data);
  }

  /**
   * Валидация hex цвета
   */
  private static isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }
}

export default FactionTypeService;
