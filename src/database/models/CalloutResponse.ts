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
      `INSERT INTO callout_responses (callout_id, subdivision_id, vk_user_id, vk_user_name, response_type, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.callout_id,
        data.subdivision_id,
        data.vk_user_id,
        data.vk_user_name,
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
   * Обновить тип ответа
   */
  static async updateResponseType(
    id: number,
    responseType: 'acknowledged' | 'on_way' | 'arrived'
  ): Promise<CalloutResponse | undefined> {
    await database.run(
      'UPDATE callout_responses SET response_type = ? WHERE id = ?',
      [responseType, id]
    );
    logger.info('Response type updated', { responseId: id, responseType });
    return await this.findById(id);
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
