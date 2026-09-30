/**
 * Объект обратной связи по совету (Фаза 4, план §10 L5): кнопка «Сделано»
 * пишет `recommendation_done`, журнал советов конвейера — служебный
 * `recommendation_issued`; оба с объектом `lever:{managerId}:{ключ}`,
 * где ключ — `leverKeyOf(candidate)` библиотеки.
 *
 * Здесь — сборка и разбор объекта, правило «какие виды обязаны ссылаться
 * на совет» и чей это совет (400/403 ручки feedback), свод отметок за
 * период для строки обзора. Чистые функции: без DI, Bitrix и Prisma.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
    type AiAnalyticsFeedbackKind,
    type AiAnalyticsFeedbackPayload,
    parseLeverKey,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_FEEDBACK_OBJECTS,
    leverFeedbackObjectOf,
} from '../../constants/ai-analytics.const';
import type { AiAnalyticsUserFeedbackKind } from '../../constants/ai-feedback.const';

/** Пользовательские виды, у которых объект — только совет (`lever:`). */
export const AI_LEVER_FEEDBACK_KINDS = [
    'recommendation_done',
] as const satisfies readonly AiAnalyticsUserFeedbackKind[];

/** Служебный вид журнала выдачи советов (пишет конвейер). */
const ISSUED_KIND =
    'recommendation_issued' as const satisfies AiAnalyticsFeedbackKind;

/** Вид отметки «Сделано». */
const DONE_KIND =
    'recommendation_done' as const satisfies AiAnalyticsFeedbackKind;

/** Тексты отказа по объекту совета (400/403 ручки feedback). */
export const AI_LEVER_FEEDBACK_MESSAGES = {
    badObject:
        'Отметка «Сделано» ставится только на совет: объект вида ' +
        'lever:{id менеджера}:{ключ совета}',
    managerMismatch:
        'Менеджер отметки не совпадает с менеджером совета в объекте',
    notOwn: 'Отмечать совет и не соглашаться с ним менеджер может только по своим советам',
} as const;

/** Разобранный объект совета. */
export interface LeverFeedbackObject {
    /** Bitrix-id менеджера совета. */
    readonly managerId: string;
    /** Ключ совета (`leverKeyOf`). */
    readonly key: string;
}

const MANAGER_ID_PATTERN = /^[1-9]\d*$/;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const { LEVER_PREFIX } = AI_ANALYTICS_FEEDBACK_OBJECTS;

/** Вид обязан ссылаться на совет? */
export function isLeverFeedbackKind(kind: string): boolean {
    return (AI_LEVER_FEEDBACK_KINDS as readonly string[]).includes(kind);
}

/**
 * Реакция ссылается на совет: вид обязан (`recommendation_done`) или
 * объект начинается с `lever:` (например, несогласие с советом). Для
 * таких записей менеджер и права берутся из объекта: иначе менеджер мог
 * бы записать несогласие на совет коллеги — шаг эффекта советов считает
 * реакции по объекту, и чужая доля несогласий исказилась бы.
 */
export function refersToLever(dto: {
    readonly kind: string;
    readonly object: string;
}): boolean {
    return isLeverFeedbackKind(dto.kind) || dto.object.startsWith(LEVER_PREFIX);
}

/** Объект совета `lever:{managerId}:{key}`. */
export function leverFeedbackObject(managerId: string, key: string): string {
    return leverFeedbackObjectOf(managerId, key);
}

/**
 * Разбор объекта совета: префикс `lever:`, числовой id менеджера и ключ,
 * который разбирается библиотекой (пять частей, известный рычаг). Чужая
 * форма → null.
 */
export function parseLeverFeedbackObject(
    object: string,
): LeverFeedbackObject | null {
    if (!object.startsWith(LEVER_PREFIX)) return null;
    const rest = object.slice(LEVER_PREFIX.length);
    const separator = rest.indexOf(':');
    if (separator <= 0) return null;
    const managerId = rest.slice(0, separator);
    const key = rest.slice(separator + 1);
    if (!MANAGER_ID_PATTERN.test(managerId)) return null;
    return parseLeverKey(key) === null ? null : { managerId, key };
}

/**
 * Менеджер записи отметки по совету: объект обязан быть
 * lever:{managerId}:{ключ} (иначе 400), переданный managerId — совпадать с
 * менеджером совета (иначе 400). Права — те же, что у useful: `scope`
 * (периметр витрины) для руководителя проверяет периметр и возвращает
 * менеджера совета, для менеджера — его собственный id; не совпало с
 * менеджером совета — 403 «только по себе».
 */
export function leverFeedbackManagerId(
    dto: { readonly object: string; readonly managerId?: string },
    scope: (requested: string) => string | null,
): string {
    const lever = parseLeverFeedbackObject(dto.object);
    if (lever === null) {
        throw new BadRequestException(AI_LEVER_FEEDBACK_MESSAGES.badObject);
    }
    if (dto.managerId !== undefined && dto.managerId !== lever.managerId) {
        throw new BadRequestException(
            AI_LEVER_FEEDBACK_MESSAGES.managerMismatch,
        );
    }
    if (scope(lever.managerId) !== lever.managerId) {
        throw new ForbiddenException(AI_LEVER_FEEDBACK_MESSAGES.notOwn);
    }
    return lever.managerId;
}

/** Отметки по советам за период: объекты «Сделано» и день выдачи. */
export interface LeverFeedbackMarks {
    /** Объекты `lever:…` с отметкой «Сделано». */
    readonly done: ReadonlySet<string>;
    /** Объект `lever:…` → самый ранний день выдачи 'YYYY-MM-DD' в периоде. */
    readonly issuedAt: ReadonlyMap<string, string>;
}

type LeverFeedbackRecord = Pick<
    AiAnalyticsFeedbackPayload,
    'kind' | 'object' | 'payload'
>;

/** День выдачи из нагрузки журнала; чужая форма → null. */
function issuedDayOf(record: LeverFeedbackRecord): string | null {
    const day = record.payload?.day;
    return typeof day === 'string' && DAY_PATTERN.test(day) ? day : null;
}

/**
 * Свод отметок по советам из актуальных записей обратной связи периода:
 * «Сделано» — по `recommendation_done`, день выдачи — самый ранний
 * `payload.day` журнала `recommendation_issued`. Записи не по совету
 * пропускаются.
 */
export function leverFeedbackMarks(
    records: readonly LeverFeedbackRecord[],
): LeverFeedbackMarks {
    const done = new Set<string>();
    const issuedAt = new Map<string, string>();
    for (const record of records) {
        if (
            typeof record.object !== 'string' ||
            parseLeverFeedbackObject(record.object) === null
        ) {
            continue;
        }
        if (record.kind === DONE_KIND) {
            done.add(record.object);
            continue;
        }
        if (record.kind !== ISSUED_KIND) continue;
        const day = issuedDayOf(record);
        const known = issuedAt.get(record.object);
        if (day !== null && (known === undefined || day < known)) {
            issuedAt.set(record.object, day);
        }
    }
    return { done, issuedAt };
}

/**
 * Отметки по советам для обзора периода из выборки «начало периода …
 * сейчас»: день выдачи — только по записям периода (created_at ≤
 * `periodEnd`), «Сделано» — по всей выборке. Прошлый период смотрят и
 * после его конца: отметка, поставленная 2 октября к совету сентября,
 * иначе пропадала бы после перечитки обзора сентября.
 */
export function periodLeverFeedbackMarks(
    records: readonly (LeverFeedbackRecord & { readonly createdAt: Date })[],
    periodEnd: Date,
): LeverFeedbackMarks {
    const inPeriod = records.filter(
        record => record.createdAt.getTime() <= periodEnd.getTime(),
    );
    return {
        done: leverFeedbackMarks(records).done,
        issuedAt: leverFeedbackMarks(inPeriod).issuedAt,
    };
}
