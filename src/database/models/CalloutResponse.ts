import database from '../db';
import logger from '../../utils/logger';
import { CalloutResponse, CreateCalloutResponseDTO } from '../../types/database.types';
import { RESPONSE_TYPE } from '../../config/constants';

/**
 * Модель для работы с таблицей callout_responses
 */
export class CalloutResponseModel {
  /**
   * Создать новый ответ на каллаут
   */
  static async create(data: CreateCalloutResponseDTO): Promise<CalloutResponse> {
    const result = await database.run(
      `INSERT INTO callout_responses (callout_id, subdivision_id, vk_user_id, vk_user_name, platform, response_type, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.callout_id,
        data.subdivision_id,
        data.vk_user_id,
        data.vk_user_name,
        data.platform || 'vk',
        data.response_type || RESPONSE_TYPE.ACKNOWLEDGED,
        data.message || null,
      ]
    );

    logger.info('Callout response created', {
      responseId: result.lastID,
      calloutId: data.callout_id,
      vkUserId: data.vk_user_id,
    });

    const response = await this.findById(result.lastID);
    if (!response) {
      throw new Error('Failed to retrieve created response');
    }

    return response;
  }

  /**
   * Найти ответ по ID
   */
  static async findById(id: number): Promise<CalloutResponse | undefined> {
    return await database.get<CalloutResponse>(
      'SELECT * FROM callout_responses WHERE id = ?',
      [id]
    );
  }

  /**
   * Получить все ответы на каллаут
   */
  static async findByCalloutId(calloutId: number): Promise<CalloutResponse[]> {
    return await database.all<CalloutResponse>(
      'SELECT * FROM callout_responses WHERE callout_id = ? ORDER BY created_at ASC',
      [calloutId]
    );
  }

  /**
   * Получить ответы подразделения на каллаут
   */
  static async findByCalloutAndSubdivision(
    calloutId: number,
    subdivisionId: number
  ): Promise<CalloutResponse[]> {
    return await database.all<CalloutResponse>(
      'SELECT * FROM callout_responses WHERE callout_id = ? AND subdivision_id = ? ORDER BY created_at ASC',
      [calloutId, subdivisionId]
    );
  }

  /**
   * Проверить, отвечал ли пользователь на каллаут
   */
  static async hasUserResponded(
    calloutId: number,
    vkUserId: string
  ): Promise<boolean> {
    const response = await database.get<CalloutResponse>(
      'SELECT * FROM callout_responses WHERE callout_id = ? AND vk_user_id = ?',
      [calloutId, vkUserId]
    );
    return !!response;
  }

  /**
   * Получить количество ответов на каллаут
   */
  static async countByCalloutId(calloutId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM callout_responses WHERE callout_id = ?',
      [calloutId]
    );
    return result?.count || 0;
  }

  /**
   * Получить количество уникальных подразделений, ответивших на каллаут
   */
  static async countUniqueSubdivisions(calloutId: number): Promise<number> {
    const result = await database.get<{ count: number }>(
      'SELECT COUNT(DISTINCT subdivision_id) as count FROM callout_responses WHERE callout_id = ?',
      [calloutId]
    );
    return result?.count || 0;
  }

  /**
   * Получить все подразделения, ответившие на каллаут
   */
  static async getRespondedSubdivisions(calloutId: number): Promise<number[]> {
    const results = await database.all<{ subdivision_id: number }>(
      'SELECT DISTINCT subdivision_id FROM callout_responses WHERE callout_id = ?',
      [calloutId]
    );
    return results.map((r) => r.subdivision_id);
  }

  /**
   * Удалить ответ
   */
  static async delete(id: number): Promise<void> {
    await database.run('DELETE FROM callout_responses WHERE id = ?', [id]);
    logger.info('Callout response deleted', { responseId: id });
  }

  /**
   * Удалить все ответы на каллаут
   */
  static async deleteByCalloutId(calloutId: number): Promise<void> {
    await database.run('DELETE FROM callout_responses WHERE callout_id = ?', [
      calloutId,
    ]);
    logger.info('All responses deleted for callout', { calloutId });
  }

  /**
   * Получить последний ответ пользователя на каллаут
   */
  static async getLastUserResponse(
    calloutId: number,
    vkUserId: string
  ): Promise<CalloutResponse | undefined> {
    return await database.get<CalloutResponse>(
      'SELECT * FROM callout_responses WHERE callout_id = ? AND vk_user_id = ? ORDER BY created_at DESC LIMIT 1',
      [calloutId, vkUserId]
    );
  }

  /**
   * Получить последний ответ подразделения на каллаут (с любой платформы)
   */
  static async getLastSubdivisionResponse(
    calloutId: number,
    subdivisionId: number
  ): Promise<CalloutResponse | undefined> {
    return await database.get<CalloutResponse>(
      'SELECT * FROM callout_responses WHERE callout_id = ? AND subdivision_id = ? ORDER BY created_at DESC LIMIT 1',
      [calloutId, subdivisionId]
    );
  }


  /**
   * Атомарно создать ответ только если подразделение ещё не отвечало на каллаут.
   * Использует INSERT ... SELECT WHERE NOT EXISTS — гарантирует отсутствие дублей
   * даже при параллельных запросах.
   */
  static async createIfNotExists(
    data: CreateCalloutResponseDTO
  ): Promise<{ response: CalloutResponse; created: boolean }> {
    const result = await database.run(
      `INSERT INTO callout_responses (callout_id, subdivision_id, vk_user_id, vk_user_name, platform, response_type, message)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM callout_responses WHERE callout_id = ? AND subdivision_id = ?
       )`,
      [
        data.callout_id,
        data.subdivision_id,
        data.vk_user_id,
        data.vk_user_name,
        data.platform || 'vk',
        data.response_type || RESPONSE_TYPE.ACKNOWLEDGED,
        data.message || null,
        data.callout_id,
        data.subdivision_id,
      ]
    );

    if (result.changes === 0) {
      const existing = await this.getLastSubdivisionResponse(data.callout_id, data.subdivision_id);
      if (!existing) {
        throw new Error(`Duplicate response not found for callout ${data.callout_id}, subdivision ${data.subdivision_id}`);
      }
      return { response: existing, created: false };
    }

    logger.info('Callout response created (atomic)', {
      responseId: result.lastID,
      calloutId: data.callout_id,
      vkUserId: data.vk_user_id,
    });

    const response = await this.findById(result.lastID);
    if (!response) {
      throw new Error('Failed to retrieve created response');
    }
    return { response, created: true };
  }


  /**
   * Получить статистику ответов подразделения
   */
  static async getSubdivisionStats(subdivisionId: number): Promise<{
    total: number;
    uniqueCallouts: number;
  }> {
    const total = await database.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM callout_responses WHERE subdivision_id = ?',
      [subdivisionId]
    );

    const uniqueCallouts = await database.get<{ count: number }>(
      'SELECT COUNT(DISTINCT callout_id) as count FROM callout_responses WHERE subdivision_id = ?',
      [subdivisionId]
    );

    return {
      total: total?.count || 0,
      uniqueCallouts: uniqueCallouts?.count || 0,
    };
  }
}

export default CalloutResponseModel;
