/**
 * Проверка черновика методики на одном звонке до включения (этап 6.6):
 * общий контракт админки (ставит задание и читает состояние) и воркера
 * event-sales (запускает один проход методики и пишет итог).
 *
 * Состояние живёт в Redis час: это разовая проверка, в историю разборов она
 * не попадает и оценки звонка не меняет.
 */
import type {
    CapTriggered,
    MethodologyOutcome,
} from './methodology-result.types';

/** Сколько хранится состояние проверки, сек. */
export const METHODOLOGY_PREVIEW_TTL_SEC = 3600;

/** Ключ состояния проверки в Redis. */
export const methodologyPreviewKey = (previewId: string): string =>
    `call-report:methodology-preview:${previewId}`;

/** Идентификатор проверки — uuid: чужие значения в ключ Redis не идут. */
export const METHODOLOGY_PREVIEW_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const METHODOLOGY_PREVIEW_STATUSES = [
    'queued',
    'running',
    'done',
    'failed',
] as const;
export type MethodologyPreviewStatus =
    (typeof METHODOLOGY_PREVIEW_STATUSES)[number];

/** Данные задания проверки. */
export interface MethodologyPreviewJobData {
    previewId: string;
    domain: string;
    transcriptionId: string;
    /** Черновик конфига методики из формы — проверяется валидатором в воркере. */
    config: unknown;
    requestedBy?: string;
}

/** Итог проверки черновика на звонке. */
export interface MethodologyPreviewResult {
    /** Тип звонка, с которым шёл разбор; null — не определён. */
    callType: string | null;
    /** У методики есть пункты или спирали для этого типа звонка. */
    applicable: boolean;
    /** Пункты и спирали по черновику; null — методика к звонку не применима. */
    methodology: MethodologyOutcome | null;
    /** Ограничители, которые сработали бы на этом звонке. */
    capsTriggered: CapTriggered[];
    /** Итоговая оценка действующего разбора; null — оценки нет. */
    scoreBefore: number | null;
    /** Итоговая оценка с ограничителями черновика. */
    scoreAfter: number | null;
    /** Модель, ответившая на проход; null — проход не вызывался или модель не названа. */
    model: string | null;
    /** Токены вызова; null — проход не вызывался. */
    tokens: number | null;
}

/** Состояние проверки в Redis — ответ админки на опрос. */
export interface MethodologyPreviewState {
    previewId: string;
    status: MethodologyPreviewStatus;
    domain: string;
    transcriptionId: string;
    /** Причина отказа словами; null — ошибки нет. */
    error: string | null;
    result: MethodologyPreviewResult | null;
    /** Момент последнего изменения, ISO. */
    updatedAt: string;
}

/** Начальное состояние: задание поставлено, воркер ещё не взял. */
export const queuedMethodologyPreview = (
    data: Pick<
        MethodologyPreviewJobData,
        'previewId' | 'domain' | 'transcriptionId'
    >,
    now: Date,
): MethodologyPreviewState => ({
    previewId: data.previewId,
    status: 'queued',
    domain: data.domain,
    transcriptionId: data.transcriptionId,
    error: null,
    result: null,
    updatedAt: now.toISOString(),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Состояние из строки Redis; чужая форма или битый JSON — null. */
export function parseMethodologyPreviewState(
    raw: string | null,
): MethodologyPreviewState | null {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (
            !isRecord(value) ||
            typeof value.previewId !== 'string' ||
            typeof value.status !== 'string' ||
            !(METHODOLOGY_PREVIEW_STATUSES as readonly string[]).includes(
                value.status,
            )
        ) {
            return null;
        }
        return value as unknown as MethodologyPreviewState;
    } catch {
        return null;
    }
}
