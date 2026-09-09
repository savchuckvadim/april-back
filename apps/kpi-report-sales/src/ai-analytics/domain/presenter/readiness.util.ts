/**
 * Готовность витрины (план §4.11) — ТОНКИЙ АДАПТЕР над `buildReadiness`
 * библиотеки (поток 10). Собственных гейтов и порогов файл не держит:
 * правила режимов живут в одном месте (`model/readiness.ts`), иначе
 * приложение и модель со временем разъезжаются.
 *
 * Задача адаптера: посчитать по lite-строкам счётчики окна (месяцы
 * истории от первого разобранного звонка, разобранные презентации, дата
 * сопоставимости версий), добавить то, что знает только приложение
 * (продажи, состав, календарь, гипотеза, режим β), позвать библиотеку и
 * разложить её результат в `ReadinessDto`.
 *
 * Чистые функции: «сейчас» приходит параметром.
 */
import { CALL_REPORT_CALL_TYPE_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart';
import {
    AI_READINESS_GATE_DEFAULTS,
    AI_READINESS_REASON_CODES,
    buildReadiness as buildReadinessRules,
    comparableFrom,
    readinessReason,
    type AiBetaSource,
    type BetaCountdown,
    type ReadinessGates,
    type ReadinessInput,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsReadinessMode } from '../../constants/ai-analytics.const';
import { AiBetaCountdownDto, ReadinessDto } from '../../dto/readiness.dto';
import { DatedLiteRow } from '../loaders/lite-row.mapper';

const PRESENTATION_TYPE: (typeof CALL_REPORT_CALL_TYPE_CODES)[number] =
    'presentation';
const MS_PER_MONTH = 30.44 * 86_400_000;

/**
 * Коды причин режима с подставленными гейтами — те же строки, что вернёт
 * библиотека. Значения гейтов берутся из её дефолтов, своих чисел здесь
 * нет.
 */
export const READINESS_REASONS = {
    kpiOnly: AI_READINESS_REASON_CODES.kpiOnly,
    historyShort: readinessReason(
        AI_READINESS_REASON_CODES.historyShort,
        AI_READINESS_GATE_DEFAULTS.calibrationMonths,
    ),
    presentationsFew: readinessReason(
        AI_READINESS_REASON_CODES.presentationsFew,
        AI_READINESS_GATE_DEFAULTS.calibrationPresentations,
    ),
    normsPresentationsFew: readinessReason(
        AI_READINESS_REASON_CODES.normsPresentationsFew,
        AI_READINESS_GATE_DEFAULTS.normsPresentations,
    ),
    calendarMissing: AI_READINESS_REASON_CODES.calendarMissing,
    rosterNotConfirmed: AI_READINESS_REASON_CODES.rosterNotConfirmed,
    hypothesisMissing: AI_READINESS_REASON_CODES.hypothesisMissing,
} as const;

/** Дата сопоставимости: max по датам версий всех разборов окна. */
export function resolveComparableFrom(rows: readonly DatedLiteRow[]): string {
    const versionValues = rows.flatMap(row =>
        row.versions ? Object.values(row.versions) : [],
    );
    return comparableFrom(versionValues);
}

/** Счётчики окна готовности: месяцы истории и разобранные презентации. */
export function readinessCounters(
    rows: readonly DatedLiteRow[],
    now: Date,
): { historyMonths: number; presentations: number } {
    const analyzed = rows.filter(row => row.analysisPresent);
    const earliest = analyzed.reduce<number | null>(
        (min, row) =>
            min === null
                ? row.callStartedAt.getTime()
                : Math.min(min, row.callStartedAt.getTime()),
        null,
    );

    return {
        historyMonths:
            earliest === null
                ? 0
                : Math.floor((now.getTime() - earliest) / MS_PER_MONTH),
        presentations: analyzed.filter(
            row => row.callType === PRESENTATION_TYPE,
        ).length,
    };
}

/**
 * Продажи окна готовности: закрытые сделки финансов, а при пустых
 * финансах — продажи, подтверждённые эпизодами сделок (снапшот прогноза).
 * Заглушки «продажи не считаются» больше нет.
 */
export function resolveReadinessSales(
    financeSales: number,
    episodeSales = 0,
): number {
    const finance = Math.max(0, financeSales);

    return finance > 0 ? finance : Math.max(0, episodeSales);
}

/** Вход адаптера: то, что знает приложение, но не знают правила режимов. */
export interface ReadinessOptions {
    now: Date;
    enabled: boolean;
    pipelineEnabled: boolean;
    /** Закрытые продажи периода из финансов. */
    financeSales?: number;
    /** Продажи по эпизодам сделок — запасной источник при пустых финансах. */
    episodeSales?: number;
    /** Производственный календарь портала импортирован (есть праздники). */
    calendarImported?: boolean;
    /** Записей в `ai_analytics_levels`. */
    rosterLevels?: number;
    /** `ai_analytics_roster_confirmed_at`; '' — не подтверждали. */
    rosterConfirmedAt?: string;
    /** Пар в `ai_analytics_hypothesis`. */
    hypothesisPairs?: number;
    /** Режим связи «качество → исход» из модели портала. */
    betaSource?: AiBetaSource;
    /** Счётчик до гейта β из модели портала. */
    betaCountdown?: BetaCountdown | null;
    /** Гейты режимов; по умолчанию — дефолты библиотеки. */
    gates?: ReadinessGates;
}

/** Готовность витрины: счётчики окна + правила режимов библиотеки. */
export function buildReadiness(
    rows: readonly DatedLiteRow[],
    options: ReadinessOptions,
): ReadinessDto {
    const counters = readinessCounters(rows, options.now);
    const input: ReadinessInput = {
        enabled: options.enabled,
        pipelineEnabled: options.pipelineEnabled,
        historyMonths: counters.historyMonths,
        presentations: counters.presentations,
        sales: resolveReadinessSales(
            options.financeSales ?? 0,
            options.episodeSales ?? 0,
        ),
        comparableFrom: resolveComparableFrom(rows),
        // Календарь и состав приходят из настроек портала: без них гейт
        // норм не проходится, но и врать «данных нет» нельзя — по
        // умолчанию считаем календарь известным, а состав — нет.
        calendarImported: options.calendarImported ?? true,
        rosterLevels: options.rosterLevels ?? 0,
        rosterConfirmedAt: options.rosterConfirmedAt ?? '',
        hypothesisPairs: options.hypothesisPairs ?? 0,
        betaSource: options.betaSource ?? 'none',
        betaCountdown: options.betaCountdown ?? null,
    };
    const result = buildReadinessRules(input, options.gates);
    const mode: AiAnalyticsReadinessMode = result.mode;

    return {
        mode,
        historyMonths: result.historyMonths,
        presentations: result.presentations,
        sales: result.sales,
        comparableFrom: result.comparableFrom,
        reasons: result.reasons,
        betaSource: result.betaSource,
        betaCountdown: toCountdownDto(result.betaCountdown),
    };
}

/**
 * Счётчик библиотеки → поля DTO: наружу уходят только «сколько осталось»
 * (SE, презентации, месяцы). Внутренние величины гейта
 * (`presentationsForSe`, `holdMonths`) во фронт не текут.
 */
function toCountdownDto(
    countdown: BetaCountdown | null,
): AiBetaCountdownDto | null {
    return countdown === null
        ? null
        : {
              seNow: countdown.seNow,
              presentationsLeft: countdown.presentationsLeft,
              monthsLeft: countdown.monthsLeft,
          };
}
