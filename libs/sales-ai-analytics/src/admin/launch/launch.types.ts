/**
 * Контракты панели «Запуск AI после выкладки»: входы сборщика сводки
 * (всё, что сервис прочитал, — каждое чтение со своим исходом) и блоки
 * ответа `GET admin/ai-analytics/launch-status`. У каждого блока —
 * состояние и русский текст «что это и что сделать дальше».
 */
import type { AicallSmartInfo } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import type { ReanalysisRunStatus } from '../../contracts/reanalysis.types';
import type { ForecastBacktestStatus } from '../../model/forecast-backtest.types';
import type { CostSummary } from '../services/ai-analytics-cost.service';
import type { EtlStatusRun } from '../services/ai-analytics-etl-status.service';
import type { Phase4BacktestView } from '../services/ai-analytics-phase4.types';
import type { LaunchBlockState } from './launch.const';

/** Исход одного чтения: значение либо текст ошибки (сводка не падает). */
export type LaunchLoaded<T> =
    | { ok: true; value: T }
    | { ok: false; error: string };

/** Настройки kpiSales, нужные сводке. */
export interface LaunchKpiSettings {
    aiAnalyticsEnabled: boolean;
    /** Сырой JSON `ai_analytics_model_params` ('' — не задан). */
    modelParamsJson: string;
}

/** Поля настроек конвейера портала (`portal_ai_settings`), нужные сводке. */
export interface LaunchPortalAiSettings {
    enabled: boolean | null;
    allowedUserIds: number[] | null;
}

/** Всё, что прочитал сервис сводки; сборщик — чистая функция над этим. */
export interface LaunchStatusInput {
    domain: string;
    now: Date;
    /** Месяц расхода 'YYYY-MM' (текущий в поясе сводки). */
    costMonth: string;
    settings: LaunchLoaded<LaunchKpiSettings>;
    /** null — строки настроек конвейера на портале нет. */
    portalAi: LaunchLoaded<LaunchPortalAiSettings | null>;
    /** null — смарт не найден ни в PortalModel, ни в зеркале портала. */
    smart: LaunchLoaded<AicallSmartInfo | null>;
    /** Журналы прогонов конвейера за окно, свежие первыми. */
    etlRuns: LaunchLoaded<EtlStatusRun[]>;
    /** Последняя проверка точности прогноза; null — не было. */
    backtest: LaunchLoaded<Phase4BacktestView | null>;
    /** Последний прогон переразбора по домену; null — не было. */
    reanalysis: LaunchLoaded<ReanalysisRunStatus | null>;
    /** День первой готовой транскрипции 'YYYY-MM-DD'; null — разборов нет. */
    analysisSince: LaunchLoaded<string | null>;
    cost: LaunchLoaded<CostSummary>;
}

/** Состояние и текст — общая часть каждого блока. */
export interface LaunchBlock {
    state: LaunchBlockState;
    text: string;
}

export interface LaunchSettingsBlock extends LaunchBlock {
    /** `ai_analytics_enabled` kpiSales; null — не прочитано. */
    aiAnalyticsEnabled: boolean | null;
    /**
     * Главный выключатель разбора звонков портала; null — на портале не
     * задан (действует глобальный env) или не прочитан.
     */
    callAnalysisEnabled: boolean | null;
    /** Сотрудников в пилоте `allowedUserIds`; null — пилот не задан. */
    pilotSize: number | null;
}

export interface LaunchSmartBlock extends LaunchBlock {
    /** Смарт найден; null — не удалось проверить. */
    installed: boolean | null;
    /** Есть значение риск-флага «дверь закрыта»; null — неизвестно. */
    doorClosed: boolean | null;
    /** Есть тип «приглашение на мероприятие»; null — неизвестно. */
    eventInvite: boolean | null;
    /** Чего не хватает: «КОД_ПОЛЯ: код значения» или «КОД_ПОЛЯ» (поля нет). */
    missingValues: string[];
}

/** Прогон конвейера в сводке. */
export interface LaunchRunRef {
    day: string;
    rhythm: string;
    /** ok | partial | failed. */
    status: string;
    generatedAt: string;
}

export interface LaunchPipelineBlock extends LaunchBlock {
    lastBackfill: LaunchRunRef | null;
    lastMonthly: LaunchRunRef | null;
    lastNightly: LaunchRunRef | null;
    /** Месяцев окна кнопки (24 закрытых), догнанных backfill за окно журнала. */
    backfillMonths: number;
    /** Сколько месяцев догоняет кнопка (24). */
    backfillMonthsTarget: number;
    /** Свежий backfill моложе окна «идёт». */
    backfillRunning: boolean;
}

export interface LaunchForecastBlock extends LaunchBlock {
    status: ForecastBacktestStatus | null;
    monthKey: string | null;
    generatedAt: string | null;
    shadowMonths: number | null;
    shadowMinMonths: number | null;
    replayedMonths: number | null;
    reasons: string[];
    /** Причины словами. */
    reasonTexts: string[];
    /** Флаг показа прогноза; null — JSON настроек модели не прочитан. */
    stageEnabled: boolean | null;
    recommendationsStageEnabled: boolean | null;
}

/** Последний прогон переразбора в сводке. */
export interface LaunchReanalysisRun {
    from: string;
    to: string;
    dryRun: boolean;
    finished: boolean;
    /** Не закончен и давно не обновлялся — цепочка остановилась. */
    stale: boolean;
    part: number;
    candidates: number;
    done: number;
    failed: number;
    skipped: number;
    tokens: number;
    price: number;
    updatedAt: string;
    lastError: string | null;
    estimatedTokens: number | null;
    estimatedPrice: number | null;
    estimateMessage: string | null;
    /** Доля сделанного 0..1 (в частях после первой — оценка снизу). */
    progressShare: number;
}

export interface LaunchReanalysisBlock extends LaunchBlock {
    /** С какого дня на портале есть разборы — начало периода переразбора. */
    analysisSince: string | null;
    run: LaunchReanalysisRun | null;
}

export interface LaunchCostBlock extends LaunchBlock {
    month: string;
    tokens: number | null;
    /** Стоимость, ₽: факт колонок price, а без него — оценка по цене реестра. */
    price: number | null;
    estimated: boolean | null;
}

/** Ответ `GET admin/ai-analytics/launch-status`. */
export interface LaunchStatus {
    domain: string;
    checkedAt: string;
    settings: LaunchSettingsBlock;
    smart: LaunchSmartBlock;
    pipeline: LaunchPipelineBlock;
    forecast: LaunchForecastBlock;
    reanalysis: LaunchReanalysisBlock;
    cost: LaunchCostBlock;
}
