import 'reflect-metadata';
import { DEFAULT_WORK_CALENDAR } from '@lib/sales-ai-analytics';
import { ropMarkSeed } from '@lib/sales-ai-analytics/model/rop-mark';
import { AI_PIPELINE_BUS_KEYS } from '../constants/ai-snapshot.const';
import {
    AI_ROP_MARK_SKIP_REASONS,
    AI_ROP_MARK_STEP_CODE,
} from '../constants/ai-rop-mark.const';
import type { AiRopMarkPickInput } from '../store/ai-analytics-rop-mark.store';
import { createStepBus, type AiPipelineStepContext } from '../steps/step.types';
import { ropMarkCandidates, RopMarkStep } from '../steps/rop-mark.step';
import { portalSettings } from './fixtures/lite-row.fixture';

const DOMAIN = 'a.bitrix24.ru';
const WEEK = '2026-W36';
const NOW = new Date('2026-09-07T00:15:00Z');

/** Контекст недельного прогона в объёме, нужном шагу. */
function context(
    overrides: Partial<AiPipelineStepContext> = {},
): AiPipelineStepContext {
    return {
        domain: DOMAIN,
        rhythm: 'weekly',
        day: '2026-09-07',
        weekKey: WEEK,
        monthKey: '2026-09',
        timeZone: DEFAULT_WORK_CALENDAR.timeZone,
        calendar: { ...DEFAULT_WORK_CALENDAR, holidays: [] },
        settings: portalSettings(),
        registry: { portal: {}, tenureBand: {}, manager: {} } as never,
        paramsVersion: 'params-1',
        calcVersion: 'sam-1.0.0',
        comparableFrom: '',
        inputsHash: 'hash-1',
        managerIds: [11, 12, 13],
        now: NOW,
        forceRefresh: false,
        ...overrides,
    };
}

/** Строки звонков недели в форме lite-выборки (то, что кладёт шаг звонков). */
function rows(): Record<string, unknown>[] {
    return [
        {
            transcriptionId: '101',
            managerId: '11',
            callType: 'cold',
            score: 40,
        },
        {
            transcriptionId: '102',
            managerId: '12',
            callType: 'other',
            score: 35,
        },
        {
            transcriptionId: '103',
            managerId: '13',
            callType: 'presentation',
            score: 92,
        },
    ];
}

/** Типизированный мок записи подбора: аргументы вызова читаются без any. */
type SavePickMock = jest.Mock<
    Promise<{ id: string; supersededIds: string[] }>,
    [AiRopMarkPickInput]
>;

function makeStep(): { step: RopMarkStep; savePick: SavePickMock } {
    const savePick: SavePickMock = jest
        .fn<
            Promise<{ id: string; supersededIds: string[] }>,
            [AiRopMarkPickInput]
        >()
        .mockResolvedValue({ id: '1', supersededIds: [] });
    return { step: new RopMarkStep({ savePick } as never), savePick };
}

/** Аргумент первого вызова savePick. */
const pickInput = (savePick: SavePickMock): AiRopMarkPickInput =>
    savePick.mock.calls[0][0];

describe('RopMarkStep', () => {
    it('код и ритм шага: подбор идёт недельным ритмом', () => {
        const { step } = makeStep();

        expect(step.code).toBe(AI_ROP_MARK_STEP_CODE);
        expect(step.rhythms).toEqual(['weekly']);
    });

    it('пишет подбор трёх звонков недели с зерном домена и недели', async () => {
        const { step, savePick } = makeStep();
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.callsRows, rows());

        const result = await step.run(context(), bus);

        expect(result.status).toBe('ok');
        expect(result.written).toBe(1);
        expect(result.rows).toBe(3);
        const input = pickInput(savePick);
        expect(input).toMatchObject({
            domain: DOMAIN,
            weekKey: WEEK,
            seed: ropMarkSeed(DOMAIN, WEEK),
            generatedAt: NOW.toISOString(),
        });
        expect(input.calls.map(call => call.reason)).toEqual([
            'uncertain_type',
            'best_score',
            'random',
        ]);
    });

    it('повтор прогона за ту же неделю даёт тот же набор (идемпотентность)', async () => {
        const first = makeStep();
        const second = makeStep();
        const busOf = () => {
            const bus = createStepBus();
            bus.set(AI_PIPELINE_BUS_KEYS.callsRows, rows());
            return bus;
        };

        await first.step.run(context(), busOf());
        await second.step.run(context(), busOf());

        expect(pickInput(second.savePick).calls).toEqual(
            pickInput(first.savePick).calls,
        );
    });

    it('строк звонков в шине нет — шаг пропущен с причиной, запись не пишется', async () => {
        const { step, savePick } = makeStep();

        const result = await step.run(context(), createStepBus());

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_ROP_MARK_SKIP_REASONS.noCalls);
        expect(savePick).not.toHaveBeenCalled();
    });

    it('строки есть, но кандидатов нет (чужие менеджеры) — пропуск с причиной', async () => {
        const { step, savePick } = makeStep();
        const bus = createStepBus();
        bus.set(AI_PIPELINE_BUS_KEYS.callsRows, rows());

        const result = await step.run(context({ managerIds: [99] }), bus);

        expect(result.status).toBe('skipped');
        expect(result.reason).toBe(AI_ROP_MARK_SKIP_REASONS.noCandidates);
        expect(result.rows).toBe(3);
        expect(savePick).not.toHaveBeenCalled();
    });

    it('ropMarkCandidates: чужая форма и строки без менеджера отбрасываются', () => {
        expect(ropMarkCandidates('не массив')).toEqual([]);
        expect(
            ropMarkCandidates([
                null,
                { transcriptionId: '1' },
                { managerId: '11' },
                {
                    transcriptionId: '2',
                    managerId: 11,
                    callType: 5,
                    score: '7',
                },
            ]),
        ).toEqual([
            {
                transcriptionId: '2',
                managerId: '11',
                callType: null,
                score: null,
            },
        ]);
    });
});
