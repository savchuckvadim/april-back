import { Inject, Injectable } from '@nestjs/common';
import { applyOutcome, currentStep, stepTimedOut } from './refresh.plan';
import { AiRefreshStore } from './refresh.store';
import {
    AI_REFRESH_DEFAULTS,
    AI_REFRESH_STEP_CODES,
    type AiRefreshStepOutcome,
    type AiRefreshTickJobData,
} from './refresh.types';
import {
    AI_REFRESH_STEP_HANDLERS,
    type AiRefreshStepHandler,
} from './steps/refresh-step.types';

const TIMEOUT_TEXT = `Шаг идёт дольше ${Math.round(AI_REFRESH_DEFAULTS.stepTimeoutMs / 3_600_000)} часов — признан сорвавшимся; следующие шаги идут дальше.`;

/**
 * Один тик сценария «обновить всё по порядку»: ждущий шаг стартует,
 * идущий проверяется; синхронные шаги (кэш, прогноз) проходят подряд в
 * одном тике, долгий — до следующего. Сорвавшийся шаг не останавливает
 * остальные: кэш и PDF полезны и без переразбора.
 */
@Injectable()
export class AiRefreshTickUseCase {
    constructor(
        private readonly store: AiRefreshStore,
        @Inject(AI_REFRESH_STEP_HANDLERS)
        private readonly handlers: readonly AiRefreshStepHandler[],
    ) {}

    /** true — сценарий не закончен, нужен следующий тик. */
    async tick(
        data: Pick<AiRefreshTickJobData, 'domain' | 'scenarioId'>,
        now: Date = new Date(),
    ): Promise<boolean> {
        let scenario = await this.store.read(data.domain);
        if (!scenario || scenario.id !== data.scenarioId || scenario.finished) {
            return false;
        }
        // Не больше одного прохода по шагам за тик.
        for (let guard = 0; guard < AI_REFRESH_STEP_CODES.length; guard += 1) {
            const step = currentStep(scenario);
            if (step === null) break;
            const outcome = await this.outcomeOf(step.code, {
                scenario,
                step,
                now,
            });
            scenario = applyOutcome(scenario, step.code, outcome, now);
            if (outcome.state === 'running') break;
        }
        scenario = { ...scenario, updatedAt: now.toISOString() };
        await this.store.write(scenario);
        return !scenario.finished;
    }

    private outcomeOf(
        code: AiRefreshStepHandler['code'],
        context: Parameters<AiRefreshStepHandler['start']>[0],
    ): Promise<AiRefreshStepOutcome> {
        const handler = this.handlers.find(item => item.code === code);
        if (!handler) {
            return Promise.resolve({
                state: 'error',
                text: 'Шаг не подключён в этой сборке.',
            });
        }
        if (context.step.state === 'pending') return handler.start(context);
        if (stepTimedOut(context.step, context.now)) {
            return Promise.resolve({ state: 'error', text: TIMEOUT_TEXT });
        }
        return handler.probe(context);
    }
}
