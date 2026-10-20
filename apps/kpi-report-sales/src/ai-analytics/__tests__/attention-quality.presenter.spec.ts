import {
    attentionRulesOf,
    buildAttentionItems,
    toAttentionInput,
} from '../domain/presenter/attention.presenter';
import type { AiManagerRowDto } from '../dto/ai-manager-row.dto';
import { briefOverviewRow } from './fixtures/brief.fixture';

/**
 * «Внимание» над строками обзора после этапа 2: факты качества строки
 * уходят в правила слабых презентаций / доработки / низкой оценки, пороги
 * берутся из строки, риск-звонки с отменёнными видами (старый кэш) не
 * считаются, строки без `quality` (старый кэш) сигналов этапа 2 не дают.
 */
const quality = (
    patch: Partial<NonNullable<AiManagerRowDto['quality']>> = {},
): NonNullable<AiManagerRowDto['quality']> => ({
    thresholds: {
        weakSectionScoreMax: 5,
        weakSectionGap: 1,
        lowScoreCallMax: 4,
        weakFollowupShareMin: 0.5,
    },
    presentation: { n: 0, sections: [], weakCallIds: [] },
    followup: {
        n: 0,
        objectionsKnown: 0,
        objectionsUnhandled: 0,
        nextStepSet: 0,
        nextStepNoDate: 0,
        sections: [],
        weakCallIds: [],
    },
    lowScoreCalls: [],
    ...patch,
});

const rowWith = (
    managerId: string,
    patch: Partial<AiManagerRowDto> = {},
): AiManagerRowDto => ({
    ...briefOverviewRow(managerId, { analyzed: 30 }),
    ...patch,
});

describe('attention.presenter — факты качества и действующие флаги', () => {
    it('quality строки уходит во вход правил; без quality — входа этапа 2 нет', () => {
        const withQuality = toAttentionInput(
            rowWith('10', {
                quality: quality({
                    lowScoreCalls: [
                        { transcriptionId: 'c1', callType: 'cold', score: 3 },
                    ],
                }),
            }),
        );
        expect(withQuality.lowScoreCalls).toEqual([
            { transcriptionId: 'c1', callType: 'cold', score: 3 },
        ]);
        expect(withQuality.presentation?.n).toBe(0);
        expect(withQuality.followup?.n).toBe(0);

        const legacy = toAttentionInput(rowWith('10'));
        expect(legacy.presentation).toBeUndefined();
        expect(legacy.followup).toBeUndefined();
        expect(legacy.lowScoreCalls).toBeUndefined();
    });

    it('риск-звонки с отменёнными видами из старого кэша не считаются', () => {
        const input = toAttentionInput(
            rowWith('10', {
                riskCalls: [
                    {
                        transcriptionId: 'a',
                        kind: 'promise' as never,
                        callStartedAt: '2026-09-01T08:00:00.000Z',
                        link: null,
                    },
                    {
                        transcriptionId: 'b',
                        kind: 'door_closed',
                        callStartedAt: '2026-09-02T08:00:00.000Z',
                        link: null,
                    },
                    {
                        transcriptionId: 'c',
                        kind: 'urgent',
                        callStartedAt: '2026-09-03T08:00:00.000Z',
                        link: null,
                    },
                ],
            }),
        );
        expect(input.riskCalls.map(call => call.transcriptionId)).toEqual([
            'b',
            'c',
        ]);
    });

    it('пороги правил — из строки с фактами; строк с фактами нет — дефолты', () => {
        expect(attentionRulesOf([rowWith('10')])).toEqual({});
        expect(
            attentionRulesOf([
                rowWith('10'),
                rowWith('20', {
                    quality: quality({
                        thresholds: {
                            weakSectionScoreMax: 6,
                            weakSectionGap: 2,
                            lowScoreCallMax: 5,
                            weakFollowupShareMin: 0.4,
                        },
                    }),
                }),
            ]),
        ).toEqual({
            weakSectionScoreMax: 6,
            weakSectionGap: 2,
            lowScoreCallMax: 5,
            weakFollowupShareMin: 0.4,
        });
    });

    it('карточки: слабая презентация по порогу строки раньше риска, ссылка на звонки', () => {
        const items = buildAttentionItems([
            rowWith('10', {
                riskCalls: [
                    {
                        transcriptionId: 'r1',
                        kind: 'conflict',
                        callStartedAt: '2026-09-01T08:00:00.000Z',
                        link: null,
                    },
                ],
                quality: quality({
                    thresholds: {
                        weakSectionScoreMax: 6,
                        weakSectionGap: 1,
                        lowScoreCallMax: 4,
                        weakFollowupShareMin: 0.5,
                    },
                    presentation: {
                        n: 10,
                        sections: [{ section: 'NEEDS', mean: 5.8, n: 10 }],
                        weakCallIds: ['p2', 'p1'],
                    },
                }),
            }),
        ]);
        expect(items.map(item => item.signal)).toEqual([
            'weak_presentation',
            'risk',
        ]);
        expect(items[0].link).toEqual({
            managerId: '10',
            callType: 'presentation',
            transcriptionIds: ['p1', 'p2'],
        });
        // При дефолтном пороге 5 средняя 5,8 слабой не считается.
        const byDefault = buildAttentionItems([
            rowWith('10', {
                quality: quality({
                    presentation: {
                        n: 10,
                        sections: [{ section: 'NEEDS', mean: 5.8, n: 10 }],
                        weakCallIds: ['p1'],
                    },
                }),
            }),
        ]);
        expect(byDefault).toEqual([]);
    });
});
