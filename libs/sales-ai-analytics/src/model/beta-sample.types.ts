/**
 * Словарь выборки «звонок-триггер → ближний исход» для оценки β
 * (план `ai-sales-analytics`, §4.4): страты базы, причины отбрасывания,
 * формы звонка, параметров сборки, строки и самой выборки.
 *
 * Вынесено из `beta-sample.ts`, чтобы рабочий файл оставался в пределах
 * 300 строк.
 */
import type { CallReportCallTypeCode } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import type { AiCallEntityType } from './episode-link.types';
import type { DealEpisode } from './episode.types';

/**
 * Страты базы `lead_kind` (план §4.4: «страта lead_kind (cold/request/lead)»).
 * В реестре `lead_kind_strata` перечисляет измерения страт
 * (`AI_LEAD_STRATA_DIMENSIONS`: `lead_work_kind`, …), а значения измерения
 * «вид работы с лидом» — здесь; менеджерская страта `lead_mix_stratum`
 * (`cold | request | base`) — другая величина.
 */
export const AI_BETA_LEAD_KINDS = ['cold', 'request', 'lead'] as const;

export type AiBetaLeadKind = (typeof AI_BETA_LEAD_KINDS)[number];

/** Почему звонок не стал строкой выборки. */
export const AI_BETA_DROP_REASONS = [
    /** Время звонка не разобрано. */
    'bad-time',
    /** Сцепки с эпизодом нет (`confidence: none` или нет ключа). */
    'no-link',
    /** Ключ эпизода сцепки не найден среди эпизодов сущности. */
    'no-episode',
    /** Звонок другого типа: только счётчик `callsInEpisode`. */
    'control',
    /** Презентация, но не первая в эпизоде. */
    'not-trigger',
    /** Ни балла формы, ни общего балла разбора. */
    'no-score',
    /** Окно ближнего исхода ещё открыто. */
    'censored',
] as const;

export type AiBetaDropReason = (typeof AI_BETA_DROP_REASONS)[number];

/** Откуда взят S_i: среднее разделов формы или общий балл/10. */
export const AI_BETA_SCORE_SOURCES = ['form', 'total'] as const;

export type AiBetaScoreSource = (typeof AI_BETA_SCORE_SOURCES)[number];

/**
 * Тип звонка-триггера — «презентация» справочника типов portal-lib
 * (`CALL_REPORT_CALL_TYPE_CODES`); литерал проверяется компилятором.
 */
export const AI_BETA_TRIGGER_CALL_TYPE: CallReportCallTypeCode = 'presentation';

/** Раздел рубрики звонка в том виде, в каком его подаёт приложение. */
export interface BetaSampleSection {
    readonly section: string;
    /** Релевантность 0–100; раздел участвует в форме при relevance > 0. */
    readonly relevance: number;
    /** Оценка раздела 1–10; null — раздел не оценён. */
    readonly score: number | null;
}

/** Звонок — вход сборки выборки (чистая структура, без загрузчиков). */
export interface BetaSampleCall {
    readonly callId: string;
    readonly managerId: string;
    /** Момент звонка, ISO 8601. */
    readonly at: string;
    readonly callType: string | null;
    /** Общий балл разбора 0–100; null — разбора нет. */
    readonly score: number | null;
    readonly sections: readonly BetaSampleSection[];
    /** Сущность телефонии; `lead` даёт страту `lead`. */
    readonly entityType?: AiCallEntityType;
}

/** Правило страты базы для звонка в эпизоде. */
export type BetaLeadKindResolver = (
    call: BetaSampleCall,
    episode: DealEpisode,
    /** Первый эпизод той же сделки — откуда сделка пришла. */
    firstEpisode: DealEpisode,
) => AiBetaLeadKind;

export interface BetaSampleParams {
    /** Момент расчёта, ISO 8601 — только параметром. */
    readonly now: string;
    /** Коды разделов «формы»; по умолчанию csv `quality_form_sections`. */
    readonly formSections?: readonly string[];
    /** Тип звонка-триггера; по умолчанию «презентация». */
    readonly presentationCallType?: string;
    /** Окно `W_near`; по умолчанию `lag_window_near_days`. */
    readonly windowDays?: number;
    /** Сдвиг лида плацебо в неделях; по умолчанию `beta_placebo_lead_weeks`. */
    readonly leadWeeks?: number;
    /** Правило страты; по умолчанию `defaultLeadKindOf`. */
    readonly leadKindOf?: BetaLeadKindResolver;
    /** Логит нормы портал×месяц по ключу `YYYY-MM`; нет — 0. */
    readonly offsetLogitByMonth?: Readonly<Record<string, number>>;
}

/** Строка выборки до центрирования — то, что даёт разбор одного триггера. */
export interface BetaSampleSeed {
    readonly callId: string;
    readonly managerId: string;
    readonly entityId: string;
    readonly episodeKey: string;
    readonly at: string;
    /** Ключ месяца `YYYY-MM` — для оффсета портал×месяц. */
    readonly monthKey: string;
    readonly stratum: AiBetaLeadKind;
    /** S_i — оценка формы звонка по шкале 1–10. */
    readonly score: number;
    readonly scoreSource: AiBetaScoreSource;
    /** Остальные звонки эпизода (без триггера). */
    readonly callsInEpisode: number;
    /** Оффсет `logit μ_{p,month}`. */
    readonly offset: number;
    readonly outcome: 0 | 1;
    readonly daysToOutcome: number | null;
    /** Лид плацебо S̄_{m,w+k}; null — у менеджера нет звонков в той неделе. */
    readonly sBarLead: number | null;
}

/** Строка выборки с центрированными предикторами Мундлака. */
export interface BetaSampleRow extends BetaSampleSeed {
    /** `S_i − S̄_m`. */
    readonly sWithin: number;
    /** `S̄_m − S̄_p`. */
    readonly sBetween: number;
    /** `S_i − S̄_p` — предиктор pooled-спецификации. */
    readonly sCentered: number;
    /** `log(1 + callsInEpisode)`. */
    readonly logCalls: number;
}

/** Выборка «звонок-триггер → ближний исход». */
export interface BetaSample {
    /** Строки в порядке (at, callId). */
    readonly rows: readonly BetaSampleRow[];
    readonly dropped: Readonly<Record<AiBetaDropReason, number>>;
    readonly n: number;
    /** Строк с исходом 1. */
    readonly events: number;
    readonly managers: number;
    /** Страты, встретившиеся в выборке, в порядке словаря. */
    readonly strata: readonly AiBetaLeadKind[];
    /** `S̄_p` — среднее S по выборке. */
    readonly sBarPortal: number;
    /** `S̄_m` по менеджерам. */
    readonly sBarByManager: Readonly<Record<string, number>>;
    readonly windowDays: number;
    readonly formSections: readonly string[];
}
