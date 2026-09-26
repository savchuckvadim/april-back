import type { AiService } from '@lib/call-lib';
import { AI_ANALYTICS_SNAPSHOT_STATUS } from '@lib/sales-ai-analytics';

/**
 * Переводит записи ais в `status: 'superseded'` — общий механизм сторов
 * AI-аналитики (снапшоты, слепая проверка, обратная связь): история не
 * удаляется, актуальной остаётся последняя запись, а выборки по
 * умолчанию замещённые отсекают. Возвращает id замещённых записей.
 */
export async function supersedeAisRecords(
    aiService: Pick<AiService, 'update'>,
    ids: readonly string[],
): Promise<string[]> {
    for (const id of ids) {
        await aiService.update(id, {
            status: AI_ANALYTICS_SNAPSHOT_STATUS.superseded,
        });
    }
    return [...ids];
}
