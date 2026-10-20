/**
 * Блоки сводки запуска: прогноз (проверка точности и флаг показа),
 * переразбор истории и расход модели. Чистые функции; вердикт проверки
 * словами переиспользует ручка stage-flags (409 с причинами).
 */
import {
    AI_FORECAST_BACKTEST_REASONS,
    type ForecastBacktestReason,
} from '../../model/forecast-backtest.types';
import { ruCount, ruPluralForm, RU_FORMS } from '../../model/ru-text.util';
import type { ReanalysisRunStatus } from '../../contracts/reanalysis.types';
import type { Phase4BacktestView } from '../services/ai-analytics-phase4.types';
import { unreadText } from './launch-status.blocks';
import { parseModelParamsJson, stageFlagOf } from './launch-model-params';
import {
    FORECAST_BACKTEST_REASON_TEXT,
    LAUNCH_DEFAULTS,
    LAUNCH_STAGE_FLAG_PARAMS,
} from './launch.const';
import type {
    LaunchCostBlock,
    LaunchForecastBlock,
    LaunchReanalysisBlock,
    LaunchReanalysisRun,
    LaunchStatusInput,
} from './launch.types';

const MINUTE_MS = 60 * 1000;
const TOKEN_FORMS = ['токен', 'токена', 'токенов'] as const;

const isReason = (code: string): code is ForecastBacktestReason =>
    (AI_FORECAST_BACKTEST_REASONS as readonly string[]).includes(code);

/** Причины проверки словами; незнакомый код — как есть. */
export function backtestReasonTexts(reasons: readonly string[]): string[] {
    return reasons.map(code =>
        isReason(code) ? FORECAST_BACKTEST_REASON_TEXT[code] : code,
    );
}

/**
 * Вердикт проверки точности словами: пройдено / не пройдено и почему /
 * мало данных / проверки не было.
 */
export function forecastVerdictText(view: Phase4BacktestView | null): string {
    if (view === null) {
        return 'Проверки точности прогноза ещё не было: сначала «Догнать историю» и «Восстановить прогноз по истории», затем «Проверить точность прогноза».';
    }
    const why = backtestReasonTexts(view.reasons).join('; ');
    const shadow = `теневых месяцев ${view.shadowMonths} из ${view.shadowMinMonths} нужных, из них по истории восстановлено ${view.replayedMonths}`;
    if (view.status === 'pass') {
        return `Проверка пройдена (месяц ${view.monthKey}, ${shadow}): прогноз можно показывать руководителям.`;
    }
    if (view.status === 'insufficient') {
        return `Мало данных для проверки (месяц ${view.monthKey}): ${shadow}${why ? `; ${why}` : ''}. Догоните историю и восстановите прогноз, потом проверьте ещё раз.`;
    }
    return `Проверка не пройдена (месяц ${view.monthKey}): ${why || 'причина не записана'}. Показывать прогноз пока рано — точность хуже простых способов.`;
}

export function forecastBlock(input: LaunchStatusInput): LaunchForecastBlock {
    const params =
        input.settings.ok &&
        parseModelParamsJson(input.settings.value.modelParamsJson);
    const flags = params && params.ok ? params.value : null;
    const stageEnabled = flags
        ? stageFlagOf(flags, LAUNCH_STAGE_FLAG_PARAMS.forecast)
        : null;
    const recommendationsStageEnabled = flags
        ? stageFlagOf(flags, LAUNCH_STAGE_FLAG_PARAMS.recommendations)
        : null;
    const flagsNote =
        params && !params.ok
            ? ' JSON настроек модели портала не разбирается — флаг показа не прочитан, его надо поправить в карточке портала.'
            : '';
    if (!input.backtest.ok) {
        return {
            state: 'unknown',
            text: unreadText(
                'проверку точности прогноза',
                input.backtest.error,
            ),
            status: null,
            monthKey: null,
            generatedAt: null,
            shadowMonths: null,
            shadowMinMonths: null,
            replayedMonths: null,
            reasons: [],
            reasonTexts: [],
            stageEnabled,
            recommendationsStageEnabled,
        };
    }
    const view = input.backtest.value;
    const shown =
        stageEnabled === true
            ? ' Прогноз показывается в отчёте.'
            : view?.status === 'pass'
              ? ' Показ в отчёте ещё не включён — нажмите «Показать прогноз в отчёте».'
              : '';
    return {
        state: stageEnabled === true ? 'done' : 'todo',
        text: `${forecastVerdictText(view)}${shown}${flagsNote}`,
        status: view?.status ?? null,
        monthKey: view?.monthKey ?? null,
        generatedAt: view?.generatedAt ?? null,
        shadowMonths: view?.shadowMonths ?? null,
        shadowMinMonths: view?.shadowMinMonths ?? null,
        replayedMonths: view?.replayedMonths ?? null,
        reasons: view?.reasons ?? [],
        reasonTexts: backtestReasonTexts(view?.reasons ?? []),
        stageEnabled,
        recommendationsStageEnabled,
    };
}

// --- Переразбор --------------------------------------------------------------

/**
 * Доля сделанного: в первой части кандидаты — весь объём; в следующих
 * candidates — остаток на старте части, а done копится с первой, поэтому
 * done / (done + candidates) — оценка снизу.
 */
export function reanalysisProgress(run: ReanalysisRunStatus): number {
    if (run.finished) return 1;
    const total = run.part > 1 ? run.done + run.candidates : run.candidates;
    if (total <= 0) return 0;
    return Math.min(1, run.done / total);
}

export function toLaunchRun(
    run: ReanalysisRunStatus,
    now: Date,
): LaunchReanalysisRun {
    const updatedAt = Date.parse(run.updatedAt);
    const stale =
        !run.finished &&
        Number.isFinite(updatedAt) &&
        now.getTime() - updatedAt >
            LAUNCH_DEFAULTS.reanalysisStaleMinutes * MINUTE_MS;
    return {
        from: run.from,
        to: run.to,
        dryRun: run.dryRun,
        finished: run.finished,
        stale,
        part: run.part,
        candidates: run.candidates,
        done: run.done,
        failed: run.failed,
        skipped: run.skipped,
        tokens: run.tokens,
        price: run.price,
        updatedAt: run.updatedAt,
        lastError: run.lastError,
        estimatedTokens: run.estimate?.estimatedTokens ?? null,
        estimatedPrice: run.estimate?.estimatedPrice ?? null,
        estimateMessage: run.estimate?.message ?? null,
        progressShare: reanalysisProgress(run),
    };
}

/** Целое с разрядами через пробел: 1234567 → «1 234 567». */
export function groupDigits(value: number): string {
    const rounded = Math.round(value);
    const digits = String(Math.abs(rounded));
    const groups: string[] = [];
    for (let end = digits.length; end > 0; end -= 3) {
        groups.unshift(digits.slice(Math.max(0, end - 3), end));
    }
    return `${rounded < 0 ? '−' : ''}${groups.join(' ')}`;
}

const rub = (value: number): string => `${groupDigits(value)} ₽`;

/** «1 234 567 токенов» — с разрядами, форма слова по числу. */
const tokensText = (tokens: number): string =>
    `${groupDigits(tokens)} ${ruPluralForm(tokens, TOKEN_FORMS)}`;

function reanalysisText(run: LaunchReanalysisRun): string {
    const period = `${run.from} — ${run.to}`;
    if (run.dryRun) {
        const cost =
            run.estimatedPrice === null
                ? (run.estimateMessage ?? 'оценки стоимости пока нет')
                : `≈ ${rub(run.estimatedPrice)}`;
        return run.finished
            ? `Посчитано (${period}): ${ruCount(run.candidates, RU_FORMS.calls)} к переразбору, ${cost}. Можно «Запустить переразбор».`
            : `Подсчёт идёт (${period}) — обновится сам.`;
    }
    if (run.finished) {
        return `Переразбор закончен (${period}): сделано ${run.done}, сбоев ${run.failed}, потрачено ${rub(run.price)}. Дальше — «Пересобрать витрину после переразбора».`;
    }
    if (run.stale) {
        return `Переразбор остановился (${period}): сделано ${run.done}, статус давно не обновлялся${run.lastError ? `, последняя ошибка: ${run.lastError}` : ''}. Запустите ещё раз — повтор безопасен, сделанное пропускается.`;
    }
    return `Переразбор идёт (${period}): часть ${run.part}, сделано ${run.done}, сбоев ${run.failed}, потрачено ${rub(run.price)}.`;
}

export function reanalysisBlock(
    input: LaunchStatusInput,
): LaunchReanalysisBlock {
    const analysisSince = input.analysisSince.ok
        ? input.analysisSince.value
        : null;
    if (!input.reanalysis.ok) {
        return {
            state: 'unknown',
            text: unreadText('переразбор истории', input.reanalysis.error),
            analysisSince,
            run: null,
        };
    }
    const status = input.reanalysis.value;
    if (status === null) {
        return {
            state: 'todo',
            text: 'Переразбора на портале ещё не было. Начните с «Переразбор истории: посчитать» — модель не вызывается, покажется число звонков и стоимость.',
            analysisSince,
            run: null,
        };
    }
    const run = toLaunchRun(status, input.now);
    const state: LaunchReanalysisBlock['state'] =
        run.finished && !run.dryRun
            ? 'done'
            : !run.finished && !run.stale
              ? 'running'
              : 'todo';
    return { state, text: reanalysisText(run), analysisSince, run };
}

// --- Расход модели -----------------------------------------------------------

export function costBlock(input: LaunchStatusInput): LaunchCostBlock {
    if (!input.cost.ok) {
        return {
            state: 'unknown',
            text: unreadText('расход модели', input.cost.error),
            month: input.costMonth,
            tokens: null,
            price: null,
            estimated: null,
        };
    }
    const cost = input.cost.value;
    const price =
        cost.price > 0 ? cost.price : (cost.estimatedPrice ?? cost.price);
    const estimated = cost.estimated || cost.price === 0;
    return {
        state: 'done',
        text: `Расход модели за ${cost.month}: ${tokensText(cost.tokens)}, ${estimated ? '≈ ' : ''}${rub(price)}${estimated ? ' (оценка по цене из реестра)' : ''}.`,
        month: cost.month,
        tokens: cost.tokens,
        price,
        estimated,
    };
}
