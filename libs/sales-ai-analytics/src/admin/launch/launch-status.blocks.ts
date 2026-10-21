/**
 * Блоки сводки запуска: настройки, смарт, журнал прогонов. Чистые функции
 * над прочитанным (`LaunchStatusInput`) — тексты для владельца, без
 * английских кодов там, где их можно не показывать.
 */
import {
    type AicallSmartInfo,
    CALL_REPORT_SMART_FIELDS,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';
import { ruCount, RU_FORMS } from '../../model/ru-text.util';
import type { EtlStatusRun } from '../services/ai-analytics-etl-status.service';
import {
    LAUNCH_DEFAULTS,
    LAUNCH_RHYTHM,
    LAUNCH_RUN_STATUS,
    LAUNCH_SMART_REQUIRED_VALUES,
} from './launch.const';
import type {
    LaunchLoaded,
    LaunchPipelineBlock,
    LaunchRunRef,
    LaunchSettingsBlock,
    LaunchSmartBlock,
    LaunchStatusInput,
} from './launch.types';

const HOUR_MS = 60 * 60 * 1000;

export const EMPLOYEE_FORMS = [
    'сотрудник',
    'сотрудника',
    'сотрудников',
] as const;

/** «не удалось прочитать: …» для блока, чьё чтение упало. */
export const unreadText = (what: string, error: string): string =>
    `Не удалось проверить ${what}: ${error}. Обновите панель позже; если ` +
    'ошибка повторяется — попросите разработчика посмотреть лог admin.';

const valueOf = <T>(loaded: LaunchLoaded<T>): T | null =>
    loaded.ok ? loaded.value : null;

// --- Настройки ---------------------------------------------------------------

export function settingsBlock(input: LaunchStatusInput): LaunchSettingsBlock {
    if (!input.settings.ok) {
        return {
            state: 'unknown',
            text: unreadText('настройки kpiSales', input.settings.error),
            aiAnalyticsEnabled: null,
            callAnalysisEnabled: null,
            pilotSize: null,
        };
    }
    const enabled = input.settings.value.aiAnalyticsEnabled;
    const portalAi = valueOf(input.portalAi);
    const callAnalysisEnabled = portalAi?.enabled ?? null;
    const pilot = portalAi?.allowedUserIds ?? null;
    const pilotSize = pilot && pilot.length > 0 ? pilot.length : null;
    const pilotText =
        pilotSize === null
            ? 'Пилот не задан — разбираются звонки всех сотрудников отдела.'
            : `Пилот: ${ruCount(pilotSize, EMPLOYEE_FORMS)} (поле «Пилот» в настройках AI портала) — переразбор по умолчанию идёт по ним.`;
    const parts: string[] = [];
    if (!enabled) {
        parts.push(
            'AI-аналитика портала выключена: вкладка AI в отчёте скрыта, дайджест не уходит. Включите «AI-аналитика ОП включена» в карточке портала → Настройки приложений → kpiSales.',
        );
    }
    if (callAnalysisEnabled === false) {
        parts.push(
            'Разбор звонков на портале выключен — новые разборы не появятся. Включите его в Настройках AI портала.',
        );
    }
    if (parts.length === 0) {
        parts.push(
            callAnalysisEnabled === null
                ? 'AI-аналитика включена; разбор звонков работает по общим настройкам сервера.'
                : 'AI-аналитика и разбор звонков включены.',
        );
    }
    parts.push(pilotText);
    if (!input.portalAi.ok) {
        parts.push(
            `Настройки AI портала не прочитаны (${input.portalAi.error}).`,
        );
    }
    return {
        state: enabled && callAnalysisEnabled !== false ? 'done' : 'todo',
        text: parts.join(' '),
        aiAnalyticsEnabled: enabled,
        callAnalysisEnabled,
        pilotSize,
    };
}

// --- Смарт -------------------------------------------------------------------

/**
 * Чего не хватает смарту относительно const-конфига: поле-перечисление
 * без значений справочника — «КОД: значение», поля нет вовсе — «КОД».
 */
export function smartEnumGaps(info: AicallSmartInfo): string[] {
    const gaps: string[] = [];
    for (const def of CALL_REPORT_SMART_FIELDS) {
        if (def.type !== 'enumeration' || !def.items?.length) continue;
        const present = info.enumItems[def.code];
        if (present === undefined && info.ufKeyByCode[def.code] === undefined) {
            gaps.push(def.code);
            continue;
        }
        for (const item of def.items) {
            if (present?.[item.CODE] === undefined) {
                gaps.push(`${def.code}: ${item.CODE}`);
            }
        }
    }
    return gaps;
}

/** Есть ли у смарта значение перечисления (поле — по справочнику конфига). */
function hasRequiredValue(
    info: AicallSmartInfo,
    required: (typeof LAUNCH_SMART_REQUIRED_VALUES)[keyof typeof LAUNCH_SMART_REQUIRED_VALUES],
): boolean {
    const field = CALL_REPORT_SMART_FIELDS.find(
        def => def.items === required.items,
    );
    if (!field) return false;
    return info.enumItems[field.code]?.[required.code] !== undefined;
}

export function smartBlock(input: LaunchStatusInput): LaunchSmartBlock {
    if (!input.smart.ok) {
        return {
            state: 'unknown',
            text: unreadText('смарт «AI-анализ звонков»', input.smart.error),
            installed: null,
            doorClosed: null,
            eventInvite: null,
            missingValues: [],
        };
    }
    const info = input.smart.value;
    if (info === null) {
        return {
            state: 'todo',
            text: 'Смарт «AI-анализ звонков» на портале не найден (или его зеркало в админке пустое). Нажмите «Обновить смарт» — он создастся и получит все поля.',
            installed: false,
            doorClosed: false,
            eventInvite: false,
            missingValues: [],
        };
    }
    const missingValues = smartEnumGaps(info);
    const doorClosed = hasRequiredValue(
        info,
        LAUNCH_SMART_REQUIRED_VALUES.doorClosed,
    );
    const eventInvite = hasRequiredValue(
        info,
        LAUNCH_SMART_REQUIRED_VALUES.eventInvite,
    );
    const complete = missingValues.length === 0;
    return {
        state: complete ? 'done' : 'todo',
        text: complete
            ? 'Смарт установлен, все значения на месте (в том числе «После отказа не оставил дверь открытой» и «Приглашение на мероприятие»).'
            : `Смарту не хватает значений (${missingValues.length}): разборы пишутся, но без них в карточке. Нажмите «Обновить смарт» — недостающее дольётся, повтор безопасен.`,
        installed: true,
        doorClosed,
        eventInvite,
        missingValues,
    };
}

// --- Журнал прогонов ---------------------------------------------------------

const toRef = (run: EtlStatusRun): LaunchRunRef => ({
    day: run.day,
    rhythm: run.rhythm,
    status: run.status,
    generatedAt: run.generatedAt,
});

/** Свежий первым: прогоны журнала по времени формирования. */
function latestOf(
    runs: readonly EtlStatusRun[],
    rhythm: string,
): EtlStatusRun | null {
    const own = runs.filter(run => run.rhythm === rhythm);
    own.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return own[0] ?? null;
}

/** Прогон моложе окна «идёт» (догон ставит джобы, воркер считает по очереди). */
export function isFreshRun(run: LaunchRunRef | null, now: Date): boolean {
    if (run === null) return false;
    const at = Date.parse(run.generatedAt);
    return (
        Number.isFinite(at) &&
        now.getTime() - at < LAUNCH_DEFAULTS.runningWindowHours * HOUR_MS
    );
}

export function pipelineBlock(input: LaunchStatusInput): LaunchPipelineBlock {
    const target = LAUNCH_DEFAULTS.backfillMonths;
    if (!input.etlRuns.ok) {
        return {
            state: 'unknown',
            text: unreadText('журнал прогонов', input.etlRuns.error),
            lastBackfill: null,
            lastMonthly: null,
            lastNightly: null,
            backfillMonths: 0,
            backfillMonthsTarget: target,
            backfillRunning: false,
        };
    }
    const runs = input.etlRuns.value;
    const backfill = latestOf(runs, LAUNCH_RHYTHM.backfill);
    const monthly = latestOf(runs, LAUNCH_RHYTHM.monthly);
    const nightly = latestOf(runs, LAUNCH_RHYTHM.nightly);
    const months = new Set(
        runs
            .filter(run => run.rhythm === LAUNCH_RHYTHM.backfill)
            .map(run => run.day.slice(0, 7)),
    ).size;
    const lastBackfill = backfill ? toRef(backfill) : null;
    const running = isFreshRun(lastBackfill, input.now) && months < target;
    const nightlyText = nightly
        ? `Последний ночной прогон — ${nightly.day} (${runStatusText(nightly.status)}).`
        : 'Ночных прогонов за последние недели нет — проверьте, включена ли AI-аналитика.';
    let state: LaunchPipelineBlock['state'];
    let head: string;
    if (months >= target) {
        state = 'done';
        head = `История догнана: ${ruCount(months, RU_FORMS.months)} в журнале.`;
    } else if (running) {
        state = 'running';
        head = `Догон истории идёт: посчитано ${months} из ${target} месяцев — месяцы считаются по одному, от старых к свежим. Когда закончится, нажмите «Восстановить прогноз по истории».`;
    } else if (months > 0) {
        state = 'todo';
        head = `Догнано ${months} из ${target} месяцев — нажмите «Догнать историю» ещё раз: месяцы пересчитаются заново по очереди.`;
    } else {
        state = 'todo';
        head =
            'История за 24 месяца ещё не догонялась — нажмите «Догнать историю».';
    }
    return {
        state,
        text: `${head} ${nightlyText}`,
        lastBackfill,
        lastMonthly: monthly ? toRef(monthly) : null,
        lastNightly: nightly ? toRef(nightly) : null,
        backfillMonths: months,
        backfillMonthsTarget: target,
        backfillRunning: running,
    };
}

/** Итог прогона словами. */
export function runStatusText(status: string): string {
    if (status === LAUNCH_RUN_STATUS.ok) return 'без ошибок';
    if (status === LAUNCH_RUN_STATUS.partial) {
        return 'часть шагов пропущена или упала';
    }
    if (status === LAUNCH_RUN_STATUS.failed) return 'упал';
    return 'итог не записан';
}
