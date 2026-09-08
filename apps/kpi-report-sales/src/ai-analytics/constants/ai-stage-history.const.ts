/**
 * Константы шага истории стадий (план Фазы 2, поток 13 «p2-stage-history»):
 * код и ритмы шага, причины штатного пропуска, окно выгрузки, пороги
 * объёма и ключ кэша.
 *
 * Файл отдельный от constants/ai-analytics.const.ts и ai-snapshot.const.ts
 * намеренно (правило владения общими файлами §1.6 пп. 3): в первый пишет
 * только поток настроек, во второй — поток конвейера. Ключи шины шаг берёт
 * из AI_PIPELINE_BUS_KEYS — своих магических строк не заводит.
 */
import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import type { BxStageHistoryEntityTypeId } from '@lib/bitrix/domain/crm/stage-history';
import { AI_ANALYTICS_CACHE_PREFIX } from './ai-analytics.const';
import type { AiPipelineRhythm } from './ai-snapshot.const';

/** Код шага в журнале прогона и в белом списке шагов джобы. */
export const AI_STAGE_HISTORY_STEP_CODE = 'stage-history' as const;

/**
 * Ритмы шага: ночной пересчёт, месячная заморозка и backfill. Недельного
 * ритма нет — история стадий нужна модели портала и прогнозу, а они
 * считаются ночью и на закрытии месяца.
 */
export const AI_STAGE_HISTORY_RHYTHMS = [
    'nightly',
    'monthly',
    'backfill',
] as const satisfies readonly AiPipelineRhythm[];

/**
 * Причины штатного пропуска (§5.4 «штатная деградация»): у портала нет
 * прав на crm.stagehistory.list, воронка sales_base не настроена, либо
 * глубина истории меньше гейта. Во всех трёх случаях конвейер идёт дальше:
 * прогноз отдаёт pipelineExpected = null, рёбра остаются в трактовке
 * интенсивности.
 */
export const AI_STAGE_HISTORY_SKIP_REASONS = {
    /** Метод недоступен или ответил ошибкой (нет scope crm). */
    unavailable: 'stage-history-unavailable',
    /** Категория sales_base («ОП Основная») не настроена на портале. */
    noCategory: 'stage-history-no-category',
    /** Глубина истории меньше AI_STAGE_HISTORY_MIN_MONTHS. */
    tooShort: 'stage-history-too-short',
} as const;

export type AiStageHistorySkipReason =
    (typeof AI_STAGE_HISTORY_SKIP_REASONS)[keyof typeof AI_STAGE_HISTORY_SKIP_REASONS];

/**
 * Гейт качества данных dq «stagehistory ≥ 3 мес.» (план §2.1, строка
 * dq_gates). Отдельного кода реестра под него ещё нет — когда поток
 * p2-kernel-registry заведёт `dq_stage_history_months`, значение поедет
 * через resolveNumberParam, а константа останется дефолтом.
 */
export const AI_STAGE_HISTORY_MIN_MONTHS = 3;

/** Глубина выгрузки: год истории — окно норм и лагов продаж. */
export const AI_STAGE_HISTORY_WINDOW_MONTHS = 12;

/** Сущность истории: сделка (crm.stagehistory.list, entityTypeId = 2). */
export const AI_STAGE_HISTORY_ENTITY_TYPE_ID: BxStageHistoryEntityTypeId =
    BitrixOwnerTypeId.DEAL;

/** Предел элементов на страницу списочных методов REST («не более 50»). */
export const AI_STAGE_HISTORY_PAGE_SIZE = 50;

/**
 * Пределы объёма: строк за прогон (риск потока — «объём за 12 мес. велик»),
 * раундов курсора (защита от бесконечного цикла) и команд в одном батче.
 */
export const AI_STAGE_HISTORY_LIMITS = {
    /** Максимум записей истории за один вызов загрузчика. */
    maxRows: 20_000,
    /** Максимум раундов «батч окон → сдвиг курсоров». */
    maxRounds: 200,
    /** Команд в одном HTTP-батче (ограничение Битрикса). */
    batchSize: 50,
    /**
     * Больше этого числа переходов в кэш не пишем: ключ раздулся бы на
     * мегабайты. Повтор прогона крупного портала перечитает историю —
     * это дороже, но честнее молча урезанного кэша.
     */
    cacheMaxTransitions: 5_000,
} as const;

/** Секция кэша (план §3.4: новые секции model, plan, brief, stage-history). */
export const AI_STAGE_HISTORY_CACHE_SECTION = 'stage-history' as const;

/**
 * TTL кэша истории: сутки. День прогона входит в ключ, поэтому повтор за
 * тот же день читает кэш (вызовы Битрикса не удваиваются), а следующая
 * ночь берёт свежее окно.
 */
export const AI_STAGE_HISTORY_TTL_SECONDS = 60 * 60 * 24;

/** Ошибочный результат живёт коротко (§3.4: error-конверт — 120 с). */
export const AI_STAGE_HISTORY_ERROR_TTL_SECONDS = 120;

/** Ключ кэша окна истории: тип сущности, границы окна и предел строк. */
export function buildStageHistoryKey(
    domain: string,
    entityTypeId: BxStageHistoryEntityTypeId,
    fromDate: string,
    toDate: string,
    limit: number,
): string {
    return [
        `${AI_ANALYTICS_CACHE_PREFIX}:${domain}`,
        AI_STAGE_HISTORY_CACHE_SECTION,
        String(entityTypeId),
        `${fromDate}_${toDate}`,
        String(limit),
    ].join(':');
}

/**
 * Сдвиг календарной даты на months месяцев (UTC-арифметика, без TZ —
 * граница окна нужна с точностью до дня). Отрицательное значение сдвигает
 * назад. Число месяца сохраняется, а 31-е в коротком месяце переезжает на
 * начало следующего — окна остаются непрерывными (следующее начинается там,
 * где кончилось предыдущее), поэтому записи не теряются и не задваиваются.
 */
export function stageHistoryShiftMonths(day: string, months: number): string {
    const [year, month, date] = day.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return day;
    }
    const shifted = new Date(Date.UTC(year, month - 1 + months, date || 1));

    return shifted.toISOString().slice(0, 10);
}

/** Начало окна истории: день прогона минус months месяцев. */
export function stageHistoryFromDate(
    day: string,
    months: number = AI_STAGE_HISTORY_WINDOW_MONTHS,
): string {
    return stageHistoryShiftMonths(day, -Math.max(0, months));
}
