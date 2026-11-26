import type { LongCallInput } from './long-call-input.service.types';

/**
 * Метка «разбор шёл по частям» (этап 4г): кладётся в `extra.longCall` разбора,
 * когда проходы получили не полную расшифровку, а тексты длинного пути. По
 * ней видно, что разбор длинного разговора шёл по конспектам и отрывкам, и
 * проверка из админки показывает её отдельным блоком.
 */

/** Ключ метки внутри `extra` разбора. */
export const LONG_CALL_MARK_KEY = 'longCall';

/** Метка разбора по частям. */
export interface LongCallMark {
    /** На сколько частей разрезали расшифровку. */
    parts: number;
    /** Сколько частей остались без конспекта (модель не ответила). */
    partsWithoutDigest: number;
    /** Удалось ли свести разговор в одну сводку. */
    hasSummary: boolean;
    /** Знаков в расшифровке после уплотнения коротких строк (без крайних пробелов). */
    transcriptChars: number;
    /**
     * Знаков в расшифровке до уплотнения. Нет поля — разбор сделан до этой
     * доработки.
     */
    sourceChars?: number;
}

/** Метка по результату подготовки длинного разговора. */
export function buildLongCallMark(
    input: Pick<LongCallInput, 'report' | 'sourceChars' | 'transcriptChars'>,
): LongCallMark {
    const { report } = input;

    return {
        parts: report.partsCount,
        partsWithoutDigest: report.partsWithoutDigest,
        hasSummary: report.hasSummary,
        transcriptChars: input.transcriptChars,
        sourceChars: input.sourceChars,
    };
}

/** `extra` разбора с меткой; остальные ключи (например, сохранённые проходы) целы. */
export function withLongCallMark(
    extra: Record<string, unknown> | undefined,
    input: LongCallInput,
): Record<string, unknown> {
    return { ...(extra ?? {}), [LONG_CALL_MARK_KEY]: buildLongCallMark(input) };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0;

/**
 * Метка из `extra` разбора; её нет или форма чужая — null. `extra` — открытое
 * поле записи, поэтому форма проверяется.
 */
export function readLongCallMark(extra: unknown): LongCallMark | null {
    if (!isRecord(extra)) return null;
    const raw = extra[LONG_CALL_MARK_KEY];
    if (
        !isRecord(raw) ||
        !isCount(raw.parts) ||
        !isCount(raw.partsWithoutDigest) ||
        !isCount(raw.transcriptChars) ||
        typeof raw.hasSummary !== 'boolean'
    ) {
        return null;
    }

    const mark: LongCallMark = {
        parts: raw.parts,
        partsWithoutDigest: raw.partsWithoutDigest,
        hasSummary: raw.hasSummary,
        transcriptChars: raw.transcriptChars,
    };
    if (isCount(raw.sourceChars)) mark.sourceChars = raw.sourceChars;

    return mark;
}
