/**
 * ДОГОН НЕПОЛНЫХ РАЗБОРОВ — чистые правила отбора (требование владельца
 * 10.11.2026: «если упало, потом должно восстановиться, что не доехало или
 * потерялось»). Без DI, Bitrix и `new Date()`.
 *
 * Неполный разбор — активная запись `agent-analysis`, в которой не собралась
 * хотя бы одна часть многослойного разбора:
 *  - с 10.11.2026 разбор сам пишет список `incompleteParts` (фокус-проходы,
 *    синтез, методика; цельный разбор-страховка — все три прохода);
 *  - записи без этого поля, созданные с REPAIR_LEGACY_SINCE, проверяются по
 *    содержимому: нет итоговой оценки или нет ни одного раздела зоны
 *    фокус-прохода. Так догон подбирает сбои вечера 10.11.2026, случившиеся
 *    до выкладки пометки. Записи старше — не трогаем: зона без разделов там
 *    могла быть законной, а переразбор платный.
 */
import { activeAnalysisByTranscription } from '@lib/call-lib';
import {
    CALL_ANALYSIS_PARTS,
    type CallAnalysisPart,
} from '../../agent-gate/dto/agent-analysis-request.dto';
import {
    FOCUS_SECTION_CODES,
    type CallFocusKey,
} from '../contracts/call-focus-analysis.contract';

/** С какого момента записи без пометки проверяются по содержимому. */
export const REPAIR_LEGACY_SINCE = new Date('2026-11-10T00:00:00.000Z');

/** Насколько назад догон ищет неполные и неразобранные звонки. */
export const REPAIR_LOOKBACK_HOURS = 72;

/**
 * Сколько НЕПОЛНЫХ разборов портала догон переделывает за один проход:
 * переделка — новый разбор целиком (4–5 вызовов модели) и перезапись
 * карточки, поэтому понемногу.
 */
export const REPAIR_QUOTA_PER_DOMAIN = 5;

/**
 * Сколько звонков БЕЗ разбора портала догон ставит на анализ заново за
 * проход — своя квота, не общая с переделкой неполных (ревью 11.11.2026).
 * Пока основной поставщик на паузе, разборы не ждут таймаута, а сразу
 * получают отметку провала: после вечернего наплыва их может быть
 * десятки, и при общей квоте 5 в час они ждали бы сутками и пропадали по
 * сроку. Постановка дешёвая, нагрузку на модель держат очередь CALL_REPORT
 * и ограничитель запросов шлюза.
 */
export const REPAIR_REQUEUE_QUOTA_PER_DOMAIN = 30;

/** После скольких неудачных попыток звонок бросаем (с тревогой). */
export const REPAIR_MAX_ATTEMPTS = 3;

/** Запись разбора — поля, нужные отбору. */
export interface RepairRecordView {
    id: string;
    type: string;
    status: string;
    transcription_id: string;
    user_result: unknown;
    createdAt: Date;
}

export interface RepairCandidate<T extends RepairRecordView> {
    transcriptionId: string;
    record: T;
    parts: CallAnalysisPart[];
}

const FOCUS_KEYS = Object.keys(FOCUS_SECTION_CODES) as CallFocusKey[];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isPart = (value: unknown): value is CallAnalysisPart =>
    typeof value === 'string' &&
    (CALL_ANALYSIS_PARTS as readonly string[]).includes(value);

/** Коды разделов записи (поле `section` каждого раздела). */
function sectionCodesOf(result: Record<string, unknown>): Set<string> {
    const sections = Array.isArray(result.sections) ? result.sections : [];
    return new Set(
        sections
            .filter(isRecord)
            .map(section =>
                typeof section.section === 'string'
                    ? section.section
                    : typeof section.code === 'string'
                      ? section.code
                      : '',
            ),
    );
}

/**
 * Чего не хватает в разборе; пусто — разбор полный (или не проверяется).
 * Записи с пометкой верим как есть; без пометки — только свежие, по
 * содержимому.
 */
export function incompletePartsOf(
    record: Pick<RepairRecordView, 'user_result' | 'createdAt'>,
): CallAnalysisPart[] {
    const result = record.user_result;
    if (!isRecord(result)) return [];
    if (Array.isArray(result.incompleteParts)) {
        return result.incompleteParts.filter(isPart);
    }
    if (record.createdAt.getTime() < REPAIR_LEGACY_SINCE.getTime()) return [];
    const codes = sectionCodesOf(result);
    const parts: CallAnalysisPart[] = FOCUS_KEYS.filter(
        key => !FOCUS_SECTION_CODES[key].some(code => codes.has(code)),
    );
    const score = result.score;
    if (typeof score !== 'number' || !Number.isFinite(score)) {
        parts.push('synthesis');
    }
    return parts;
}

/**
 * Кандидаты догона: активные неполные разборы, свежие первыми. Квоту и
 * исчерпанные попытки (они в Redis) отсекает вызывающий.
 */
export function selectRepairCandidates<T extends RepairRecordView>(
    records: readonly T[],
): RepairCandidate<T>[] {
    const candidates: RepairCandidate<T>[] = [];
    for (const [transcriptionId, record] of activeAnalysisByTranscription(
        records,
    )) {
        const parts = incompletePartsOf(record);
        if (parts.length > 0)
            candidates.push({ transcriptionId, record, parts });
    }
    return candidates.sort(
        (a, b) => b.record.createdAt.getTime() - a.record.createdAt.getTime(),
    );
}
