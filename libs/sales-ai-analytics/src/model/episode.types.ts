/**
 * Словарь слоя эпизодов сделки (план `ai-sales-analytics`, §4.1
 * «Три единицы анализа»): константы концов, семантика стадий, коды отказа и
 * формы нормализованного перехода и эпизода.
 *
 * Вынесено из `episode.ts`, чтобы рабочий файл оставался в пределах 300 строк;
 * публичный вход слоя прежний — `model/episode` реэкспортирует этот словарь.
 * Коды стадий берутся из `as const` portal-lib: литералов стадий в модели нет
 * (ai/rules/pbx-typing.md).
 */
import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';

/** Миллисекунд в сутках — единственная календарная константа слоя. */
export const MS_PER_DAY = 86_400_000;

/** Разделитель ключа эпизода `entityId#index`. */
export const EPISODE_KEY_SEPARATOR = '#';

/** Чем закончился эпизод (план §4.1). */
export const AI_EPISODE_ENDS = ['advance', 'fail', 'censored'] as const;

export type AiEpisodeEnd = (typeof AI_EPISODE_ENDS)[number];

/** Почему получился такой конец — для «Как считаем» и разбора спорных сделок. */
export const AI_EPISODE_END_REASONS = [
    'advance',
    'fail-stage',
    'rollback',
    'open',
] as const;

export type AiEpisodeEndReason = (typeof AI_EPISODE_END_REASONS)[number];

/** Семантика стадии Битрикс: P — в работе, S — успех, F — провал. */
export const AI_STAGE_SEMANTICS = ['P', 'S', 'F'] as const;

export type AiStageSemantic = (typeof AI_STAGE_SEMANTICS)[number];

/**
 * Коды отказа лестницы `sales_base` — берутся из `as const` portal-lib,
 * литералов стадий в модели нет (ai/rules/pbx-typing.md).
 */
export const AI_EPISODE_FAIL_STAGE_CODES = [
    PBX_DEAL_SALES_BASE_STAGE_CODE.fail,
    PBX_DEAL_SALES_BASE_STAGE_CODE.apology,
    PBX_DEAL_SALES_BASE_STAGE_CODE.notCa,
] as const satisfies readonly PbxDealSalesBaseStageCode[];

/** Стадия продажи лестницы `sales_base`. */
export const AI_EPISODE_SUCCESS_STAGE_CODE: PbxDealSalesBaseStageCode =
    PBX_DEAL_SALES_BASE_STAGE_CODE.success;

/** Нормализованный переход стадии: то, что отдаёт шаг истории стадий. */
export interface StageTransition {
    /** Идентификатор сущности (сделки) строкой. */
    readonly entityId: string;
    /** Код стадии лестницы портала. */
    readonly stageCode: string;
    /** Порядок стадии в лестнице (из `as const` portal-lib). */
    readonly order: number;
    readonly semantic: AiStageSemantic;
    /** Момент перехода, ISO 8601 со смещением TZ. */
    readonly at: string;
}

/** Эпизод сделки: отрезок между двумя переходами. */
export interface DealEpisode {
    readonly entityId: string;
    /** Порядковый номер эпизода внутри сущности, с нуля. */
    readonly index: number;
    /** Ключ `entityId#index` — им сцепляются звонки и снапшоты. */
    readonly key: string;
    /** Стадия начала эпизода и её порядок. */
    readonly stageCode: string;
    readonly order: number;
    readonly startedAt: string;
    /** Момент конца; null — эпизод цензурирован (сделка открыта). */
    readonly endedAt: string | null;
    readonly toStageCode: string | null;
    readonly toOrder: number | null;
    readonly end: AiEpisodeEnd;
    readonly endReason: AiEpisodeEndReason;
    /** Длительность эпизода в днях; null у цензурированного. */
    readonly durationDays: number | null;
    /** Возраст: длительность закрытого либо `now − startedAt` открытого. */
    readonly ageDays: number;
    /** Конец эпизода — продажа. */
    readonly success: boolean;
}

export interface BuildEpisodesOptions {
    /** Момент расчёта: только параметром (ISO 8601). */
    readonly now: string;
    /** Коды отказа; по умолчанию `AI_EPISODE_FAIL_STAGE_CODES`. */
    readonly failStageCodes?: readonly string[];
    /** Код продажи; по умолчанию `AI_EPISODE_SUCCESS_STAGE_CODE`. */
    readonly successStageCode?: string;
}

/** Эпизоды, сгруппированные по сущности — вход сцепки звонков. */
export type EpisodesByEntity = Readonly<Record<string, readonly DealEpisode[]>>;
