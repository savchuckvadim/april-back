import {
    DEAL_MOVEMENT_DEFAULTS,
    dealMovementReasonTexts,
    type DealMovementRunPhase,
} from '@lib/sales-ai-analytics';
import { DealMovementEvaluator } from '../services/deal-movement-evaluator.service';
import type { DealMovementOptions } from '../types/deal-movement.types';
import { CATEGORY, TZ } from './deal-movement.fixture';
import { DIGEST_OFF, NOTES_OFF } from './deal-movement-run.fixture';

/** Портал в Иркутске (UTC+8): там ночь на 19.11 — уже 03:00. */
const DOMAIN = 'gsirk.bitrix24.ru';
const NOW = new Date('2026-11-18T19:00:00.000Z');

const OPTIONS: DealMovementOptions = {
    thresholds: DEAL_MOVEMENT_DEFAULTS,
    callsLookbackDays: 60,
    maxDeals: 10_000,
    notes: NOTES_OFF,
    digest: DIGEST_OFF,
};

const build = () => {
    const callBatchWithConcurrency = jest
        .fn()
        // История стадий: у сделки 2 переходов нет.
        .mockResolvedValueOnce([
            { result: { movement_history_0: { items: [] } } },
        ])
        // Дела Битрикса: у сделки 1 — звонок в 16:30 UTC 17.11.
        .mockResolvedValueOnce([
            {
                result: {
                    movement_work_1: [
                        {
                            TYPE_ID: '2',
                            START_TIME: '2026-11-17T16:30:00+00:00',
                            END_TIME: '2026-11-17T16:33:00+00:00',
                        },
                    ],
                },
            },
        ]);
    const addCmdBatch = jest.fn();
    const bitrix = {
        deal: {
            all: jest.fn().mockResolvedValue([
                {
                    ID: '1',
                    TITLE: 'Давняя',
                    STAGE_ID: 'C7:PRES',
                    MOVED_TIME: '2026-10-01T10:00:00+03:00',
                    // Свежую «последнюю активность» сдвинул робот — не работа.
                    LAST_ACTIVITY_TIME: '2026-11-18T10:00:00+03:00',
                },
                {
                    ID: '2',
                    TITLE: 'Свежая',
                    STAGE_ID: 'C7:PRES',
                    MOVED_TIME: '2026-11-15T10:00:00+03:00',
                },
            ]),
        },
        batch: { stageHistory: { list: jest.fn() } },
        api: { addCmdBatch, callBatchWithConcurrency },
    };
    const pbx = {
        init: jest.fn().mockResolvedValue({
            bitrix,
            PortalModel: {
                getDealCategoryByCode: () => CATEGORY,
                getTimezone: () => TZ,
            },
        }),
    };
    const calls = { load: jest.fn().mockResolvedValue(new Map()) };
    return {
        evaluator: new DealMovementEvaluator(pbx as never, calls as never),
        addCmdBatch,
    };
};

describe('оценщик движения сделок', () => {
    it('дела Битрикса — только кандидатам в «без внимания»; дни причин — по поясу портала', async () => {
        const { evaluator, addCmdBatch } = build();
        const phases: DealMovementRunPhase[] = [];

        const evaluation = await evaluator.evaluate(
            DOMAIN,
            OPTIONS,
            NOW,
            phase => {
                phases.push(phase);
                return Promise.resolve();
            },
        );

        // Сделка 2 в сроке — её дела не читаются.
        expect(addCmdBatch).toHaveBeenCalledTimes(1);
        expect(addCmdBatch).toHaveBeenCalledWith(
            'movement_work_1',
            'crm.activity.list',
            expect.any(Object),
        );
        expect(evaluation.workProbed).toBe(1);
        expect(phases).toEqual([
            'deals',
            'history',
            'calls',
            'work',
            'evaluated',
        ]);

        const verdict = evaluation.verdicts.get('1');
        if (verdict === undefined) throw new Error('нет вердикта сделки 1');
        expect(verdict.status).toBe('stuck');
        // 16:30 UTC 17.11 — это 00:30 18.11 по Иркутску.
        expect(verdict.facts.recentWork?.callDays).toEqual(['2026-11-18']);
        expect(dealMovementReasonTexts(verdict)[0]).toMatch(
            /^звонок 18\.11, стадия не меняется/,
        );
        expect(evaluation.verdicts.get('2')?.status).toBe('moving');
    });
});
