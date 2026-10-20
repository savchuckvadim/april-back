/**
 * Константы панели «Запуск AI после выкладки» (запрос владельца
 * 21.10.2026: «большие очевидные кнопки» в админке вместо Swagger):
 * маршруты, состояния блоков, окна и пороги сводки, коды флагов ступеней
 * и обязательные значения перечислений смарта. Магических строк в
 * остальном коде модуля нет (ai/rules/pbx-typing.md).
 */
import {
    CALL_REPORT_CALL_TYPE_ITEMS,
    CALL_REPORT_RISK_FLAG_ITEMS,
    type CallReportCallTypeCode,
    type CallReportRiskFlagCode,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { REANALYSIS_DEFAULTS } from '../../contracts/reanalysis.types';
import type { ForecastBacktestReason } from '../../model/forecast-backtest.types';
import type { AiAnalyticsParamCode } from '../../params/registry.const';
import type { AiAnalyticsAdminRhythm } from '../ai-analytics-admin.const';
import { AI_GUIDE_HREF } from '../guide/ai-guide.links';
import { AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS } from '../services/ai-analytics-pipeline-admin.service';

/** Маршруты панели под `admin/ai-analytics`. */
export const AI_ANALYTICS_LAUNCH_ROUTES = {
    cacheReset: 'cache/reset',
    stageFlags: 'stage-flags',
    status: 'launch-status',
} as const;

/** Состояние блока сводки: сделано / нужно сделать / идёт / неизвестно. */
export const LAUNCH_BLOCK_STATES = [
    'done',
    'todo',
    'running',
    'unknown',
] as const;
export type LaunchBlockState = (typeof LAUNCH_BLOCK_STATES)[number];

export const LAUNCH_DEFAULTS = {
    /** Сколько закрытых месяцев догоняет кнопка истории (лимит ручки backfill). */
    backfillMonths: AI_ANALYTICS_ADMIN_BACKFILL_MAX_MONTHS,
    /** Окно журнала прогонов для сводки, дней (догон 24 месяцев идёт неделями). */
    etlWindowDays: 60,
    /** Прогон моложе — «идёт», а не «не доделано», часов. */
    runningWindowHours: 3,
    /** Переразбор без обновления статуса дольше — остановился, минут. */
    reanalysisStaleMinutes: 60,
    /** Пояс «сегодня», месяца расхода и даты начала разборов. */
    timeZone: REANALYSIS_DEFAULTS.timeZone,
} as const;

/** Ритмы журнала прогонов, которые показывает сводка. */
export const LAUNCH_RHYTHM = {
    backfill: 'backfill',
    monthly: 'monthly',
    nightly: 'nightly',
} as const satisfies Record<string, AiAnalyticsAdminRhythm>;

/** Итог прогона в журнале (форма писателя kpi-report-sales). */
export const LAUNCH_RUN_STATUS = {
    ok: 'ok',
    partial: 'partial',
    failed: 'failed',
} as const;

/** Коды реестра флагов ступеней в JSON `ai_analytics_model_params`. */
export const LAUNCH_STAGE_FLAG_PARAMS = {
    forecast: 'forecast_stage_enabled',
    recommendations: 'recommendations_stage_enabled',
} as const satisfies Record<string, AiAnalyticsParamCode>;

/**
 * Значения перечислений смарта «AI-анализ звонков», без которых новые
 * разборы пишутся с пропуском (warn в логе): риск-флаг «дверь закрыта» и
 * тип «приглашение на мероприятие» (19.10.2026). Поле находится по
 * справочнику в const-конфиге смарта — без литерала кода поля.
 */
export const LAUNCH_SMART_REQUIRED_VALUES = {
    doorClosed: {
        items: CALL_REPORT_RISK_FLAG_ITEMS,
        code: 'door_closed' satisfies CallReportRiskFlagCode,
    },
    eventInvite: {
        items: CALL_REPORT_CALL_TYPE_ITEMS,
        code: 'event_invite' satisfies CallReportCallTypeCode,
    },
} as const;

/** Причины проверки точности прогноза словами (для ответов и сводки). */
export const FORECAST_BACKTEST_REASON_TEXT: Record<
    ForecastBacktestReason,
    string
> = {
    'not-enough-months': 'закрытых месяцев с фактом меньше нужного',
    'no-days': 'в месяцах нет ни одного дня с прогнозом',
    'coverage-below': 'факт попадает в вилку прогноза реже цели',
    'mase-naive':
        'ошибка не ниже, чем у простого прогноза «по темпу с начала месяца»',
    'mase-mean3': 'ошибка не ниже, чем у «среднего за три месяца»',
    'mase-undefined':
        'сравнить ошибку не с чем: у простого прогноза она нулевая',
};

/** Куда смотреть прогноз после включения (страница админки + витрина). */
export const LAUNCH_FORECAST_LINK = {
    href: AI_GUIDE_HREF.model,
    text:
        'Прогноз отдела — в отчёте kpi-sales: вкладка AI → «Сводка»; ' +
        'проверки точности — в админке: AI-аналитика → Модель.',
} as const;
