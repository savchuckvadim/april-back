/**
 * Презентер прогноза отдела `POST ai-analytics/forecast` (Фаза 4, план
 * §4.8, §10 L4; поток B3): журнал дня и проверка точности → AiForecastDto.
 *
 * Решение о показе — здесь, и оно одно: режим published — теневых
 * месяцев достаточно, проверка на истории пройдена (pass), ступень
 * включена флагом портала и итоговый режим готовности портала не ниже
 * «прогноза» (тот же, что в баннере). Вилка (и деньги) уходят наружу,
 * только если есть и журнал за месяц: в published без журнала (1-е число
 * до ночного расчёта, упавший ночной прогон) вилка null — фронт пишет
 * «цифры появятся после ночного расчёта», а не «ждать проверку». Иначе
 * режим shadow с кодами причин; сводка теневого режима и проверки
 * отдаётся всегда — по ней чек-лист показывает, сколько ещё ждать.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()`.
 */
import type { AiAnalyticsReadinessMode } from '../../constants/ai-analytics.const';
import {
    AI_FORECAST_BACKTEST_REASON_MAP,
    AI_FORECAST_PUBLISH_READINESS_MODES,
    AI_FORECAST_REASONS,
    type AiForecastMode,
    forecastShadowMonthsReason,
} from '../../constants/ai-forecast.const';
import type {
    AiForecastBacktestSummaryDto,
    AiForecastDto,
} from '../../dto/ai-forecast.dto';
import type {
    ForecastBacktestView,
    ForecastLogDayView,
} from '../assembler/forecast-snapshots.reader';

/** Входы презентера: месяц, журнал, проверка и решения портала. */
export interface ForecastSources {
    /** Текущий месяц 'YYYY-MM' в TZ портала. */
    readonly monthKey: string;
    /** Последний день журнала за месяц; null — журнала нет. */
    readonly day: ForecastLogDayView | null;
    /** Последняя проверка точности; null — ещё не считалась. */
    readonly backtest: ForecastBacktestView | null;
    /** Флаг портала `forecast_stage_enabled`. */
    readonly stageEnabled: boolean;
    /**
     * `forecast_shadow_min_months` живого реестра портала — тот же порог,
     * что у готовности витрины и `/settings`. Порог, записанный проверкой
     * при заморозке, — только справка: иначе после смены настройки баннер
     * готовности и карточка прогноза до месячного пересчёта спорили бы.
     */
    readonly shadowMinMonths: number;
    /**
     * Итоговый режим готовности портала — тот же, что у `/settings` и
     * баннера; null — прочитать не удалось, базовая ступень не проверяется.
     */
    readonly readinessMode: AiAnalyticsReadinessMode | null;
}

const canPublishAt = (mode: AiAnalyticsReadinessMode | null): boolean =>
    mode === null ||
    (AI_FORECAST_PUBLISH_READINESS_MODES as readonly string[]).includes(mode);

/** Причины, по которым проверка на истории не пройдена (или её нет). */
function backtestReasons(backtest: ForecastBacktestView | null): string[] {
    if (backtest === null) return [AI_FORECAST_REASONS.backtestInsufficient];
    if (backtest.status === 'pass') return [];
    const mapped = backtest.reasons.map(
        reason => AI_FORECAST_BACKTEST_REASON_MAP[reason],
    );
    if (backtest.status === 'insufficient' || mapped.length === 0) {
        mapped.unshift(AI_FORECAST_REASONS.backtestInsufficient);
    }
    return mapped;
}

/**
 * Коды причин shadow в порядке чек-листа: теневые месяцы → проверка →
 * «ещё не начал копиться»; без повторов. «Не начал копиться» — только
 * когда нет ни проверки, ни журнала месяца: при пройденной проверке
 * отсутствие дня — не причина тени (см. шапку). Флаг ступени — как у
 * готовности Фазы 4 (`elevateReadiness`): причина «выключено» ставится,
 * только когда гейт пройден, иначе «попросите разработчика включить»
 * подсказывала бы действие, которое ничего не изменит. Затем базовая
 * готовность: ниже «прогноза» — вилку не показываем, как и баннер.
 * Пусто — режим published.
 */
export function forecastReasons(
    sources: ForecastSources,
    minMonths: number,
): string[] {
    const monthsLogged = sources.backtest?.shadowMonths ?? 0;
    const notStarted = sources.backtest === null && sources.day === null;
    const gate = [
        ...(monthsLogged < minMonths
            ? [forecastShadowMonthsReason(minMonths)]
            : []),
        ...backtestReasons(sources.backtest),
        ...(notStarted ? [AI_FORECAST_REASONS.logMissing] : []),
    ];
    if (gate.length > 0) return [...new Set(gate)];
    if (!sources.stageEnabled) return [AI_FORECAST_REASONS.stageDisabled];
    if (!canPublishAt(sources.readinessMode)) {
        return [AI_FORECAST_REASONS.readinessBelow];
    }
    return [];
}

function backtestSummary(
    backtest: ForecastBacktestView | null,
): AiForecastBacktestSummaryDto | null {
    if (backtest === null) return null;
    const numbers = backtest.numbers;
    return {
        monthKey: backtest.monthKey,
        status: backtest.status,
        coverageShare: numbers?.coverageShare ?? null,
        coverageCi90: numbers ? [...numbers.coverageCi90] : null,
        coverageTarget: numbers?.coverageTarget ?? null,
        maseNaive: numbers?.maseNaive ?? null,
        maseMean3: numbers?.maseMean3 ?? null,
        maseMax: numbers?.maseMax ?? null,
        months: numbers?.months ?? 0,
        days: numbers?.days ?? 0,
    };
}

/** Прогноз отдела в DTO: вилка — только в режиме published и при журнале дня. */
export function presentForecast(sources: ForecastSources): AiForecastDto {
    const minMonths = sources.shadowMinMonths;
    const reasons = forecastReasons(sources, minMonths);
    const mode: AiForecastMode = reasons.length === 0 ? 'published' : 'shadow';
    const day = sources.day;
    const published = mode === 'published' && day !== null;

    return {
        mode,
        monthKey: sources.monthKey,
        asOf: day?.day ?? null,
        level: day?.level ?? null,
        band: published ? { ...day.band } : null,
        money: published && day.money ? { ...day.money } : null,
        checkSource: day?.checkSource ?? null,
        done: day?.done ?? null,
        naive: day?.naive ?? null,
        mean3: day?.mean3 ?? null,
        shadow: {
            monthsLogged: sources.backtest?.shadowMonths ?? 0,
            minMonths,
            backtest: backtestSummary(sources.backtest),
        },
        reasons,
    };
}
