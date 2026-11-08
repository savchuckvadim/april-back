/**
 * Чистая логика сценария «обновить всё по порядку»: новый сценарий,
 * текущий шаг, применение исхода шага. Без DI, Redis и часов —
 * момент передаётся снаружи.
 */
import {
    AI_REFRESH_DEFAULTS,
    AI_REFRESH_STEP_CODES,
    AI_REFRESH_STEP_TITLES,
    type AiRefreshScenario,
    type AiRefreshStep,
    type AiRefreshStepCode,
    type AiRefreshStepOutcome,
} from './refresh.types';

/** Вход нового сценария. */
export interface AiRefreshPlanInput {
    id: string;
    domain: string;
    monthKey: string;
    withReanalysis: boolean;
    requestedBy: string | null;
}

/** Первый и последний день месяца 'YYYY-MM'. */
export function monthBounds(monthKey: string): { from: string; to: string } {
    const [year, month] = monthKey.split('-').map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
        from: `${monthKey}-01`,
        to: `${monthKey}-${String(last).padStart(2, '0')}`,
    };
}

/** Последний закрытый месяц к моменту `now` (UTC-месяц минус один). */
export function lastClosedMonthKey(now: Date): string {
    const date = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

const pendingStep = (code: AiRefreshStepCode): AiRefreshStep => ({
    code,
    title: AI_REFRESH_STEP_TITLES[code],
    state: 'pending',
    phase: null,
    startedAt: null,
    finishedAt: null,
    text: null,
});

/** Новый сценарий: все шаги ждут; без переразбора первый шаг пропущен. */
export function newScenario(
    input: AiRefreshPlanInput,
    now: Date,
): AiRefreshScenario {
    const at = now.toISOString();
    const steps = AI_REFRESH_STEP_CODES.map(code =>
        code === 'reanalyze' && !input.withReanalysis
            ? {
                  ...pendingStep(code),
                  state: 'skipped' as const,
                  finishedAt: at,
                  text: 'Переразбор не заказан — считаем по уже сохранённым разборам.',
              }
            : pendingStep(code),
    );
    return {
        id: input.id,
        domain: input.domain,
        monthKey: input.monthKey,
        ...monthBounds(input.monthKey),
        withReanalysis: input.withReanalysis,
        steps,
        startedAt: at,
        updatedAt: at,
        finished: false,
        requestedBy: input.requestedBy,
    };
}

/** Шаг, который сейчас идёт или ждёт очереди; всё сделано — null. */
export function currentStep(scenario: AiRefreshScenario): AiRefreshStep | null {
    return (
        scenario.steps.find(
            step => step.state === 'pending' || step.state === 'running',
        ) ?? null
    );
}

/** Исход шага в сценарий: новая фаза — новая метка начала; конец — finishedAt. */
export function applyOutcome(
    scenario: AiRefreshScenario,
    code: AiRefreshStepCode,
    outcome: AiRefreshStepOutcome,
    now: Date,
): AiRefreshScenario {
    const at = now.toISOString();
    const steps = scenario.steps.map(step => {
        if (step.code !== code) return step;
        const phaseChanged =
            outcome.phase !== undefined && outcome.phase !== step.phase;
        const starting = step.state === 'pending' || phaseChanged;
        return {
            ...step,
            state: outcome.state,
            phase: outcome.phase ?? step.phase,
            startedAt: starting ? at : step.startedAt,
            finishedAt: outcome.state === 'running' ? null : at,
            text: outcome.text,
        };
    });
    const next = { ...scenario, steps, updatedAt: at };
    return { ...next, finished: currentStep(next) === null };
}

/** Шаг идёт дольше предела — пора признать срыв. */
export function stepTimedOut(
    step: AiRefreshStep,
    now: Date,
    limitMs: number = AI_REFRESH_DEFAULTS.stepTimeoutMs,
): boolean {
    if (step.state !== 'running' || step.startedAt === null) return false;
    return now.getTime() - Date.parse(step.startedAt) > limitMs;
}

/** Тики встали (деплой, сброс Redis) — сценарий можно запустить заново. */
export function scenarioAbandoned(
    scenario: AiRefreshScenario,
    now: Date,
): boolean {
    return (
        !scenario.finished &&
        now.getTime() - Date.parse(scenario.updatedAt) >
            AI_REFRESH_DEFAULTS.abandonedMs
    );
}
