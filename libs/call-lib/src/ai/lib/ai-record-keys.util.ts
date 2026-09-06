import { AiEntity } from '../entity/ai.entity';
import { AiRecordKeyColumn, AiRecordKeys } from '../type/ai-record-keys.type';

/** Размер порции IN-списка: запрос остаётся компактным, лимиты плейсхолдеров не задеты. */
export const AI_RECORD_KEYS_CHUNK_SIZE = 500;

/** Один набор ключей: колонка ais и уникальные валидные значения. */
export interface AiRecordKeySelector {
    column: AiRecordKeyColumn;
    values: (string | number)[];
}

const DIGITS_ONLY = /^\d+$/;

function uniqueStrings(values: string[] | undefined): string[] {
    return Array.from(new Set((values ?? []).filter(value => value !== '')));
}

/**
 * Непустые наборы ключей превращаются в селекторы. transcription_id —
 * BigInt-колонка, поэтому нечисловые значения отбрасываются заранее
 * (иначе BigInt() бросит исключение на середине выборки).
 */
export function buildAiRecordKeySelectors(
    keys: AiRecordKeys,
): AiRecordKeySelector[] {
    const selectors: AiRecordKeySelector[] = [];
    const activityIds = uniqueStrings(keys.activityIds);
    if (activityIds.length) {
        selectors.push({ column: 'activity_id', values: activityIds });
    }
    const transcriptionIds = uniqueStrings(keys.transcriptionIds).filter(id =>
        DIGITS_ONLY.test(id),
    );
    if (transcriptionIds.length) {
        selectors.push({
            column: 'transcription_id',
            values: transcriptionIds,
        });
    }
    const entityIds = Array.from(
        new Set((keys.entityIds ?? []).filter(id => Number.isInteger(id))),
    );
    if (entityIds.length) {
        selectors.push({ column: 'entity_id', values: entityIds });
    }
    return selectors;
}

/** Режет массив на порции по size (последняя — короче). */
export function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

/** Значение ключа записи в строковом виде (для группировки), null — ключ не заполнен. */
export function aiRecordKeyValue(
    entity: AiEntity,
    column: AiRecordKeyColumn,
): string | null {
    const value = entity[column];
    return value === null || value === undefined ? null : String(value);
}

function compareAiEntityId(a: AiEntity, b: AiEntity): number {
    const left = BigInt(a.id);
    const right = BigInt(b.id);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
}

/** Стабильный порядок результата — по возрастанию id. */
export function sortAiEntitiesById(entities: AiEntity[]): AiEntity[] {
    return [...entities].sort(compareAiEntityId);
}

/** На каждый ключ (значение колонки) — запись с максимальным id; результат по id. */
export function pickLatestAiEntityPerKey(
    entities: AiEntity[],
    column: AiRecordKeyColumn,
): AiEntity[] {
    const latest = new Map<string, AiEntity>();
    for (const entity of entities) {
        const key = aiRecordKeyValue(entity, column);
        if (key === null) continue;
        const current = latest.get(key);
        if (!current || compareAiEntityId(entity, current) > 0) {
            latest.set(key, entity);
        }
    }
    return sortAiEntitiesById([...latest.values()]);
}
