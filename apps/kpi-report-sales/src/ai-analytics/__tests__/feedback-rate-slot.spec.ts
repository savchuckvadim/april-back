import { Logger } from '@nestjs/common';
import {
    decideFeedbackWrite,
    isRateFeedbackKind,
    needsSameDayLookup,
} from '../domain/use-cases/feedback-dedup.util';
import type {
    AiAnalyticsFeedbackInput,
    AiAnalyticsFeedbackRecord,
} from '../store/ai-analytics-feedback.store';
import {
    FEEDBACK_LEADER as leader,
    makeFeedbackUseCase,
} from './fixtures/feedback-use-case.fixture';

/** Четверг 03.09.2026 13:00 MSK — день портала 2026-09-03. */
const NOW = new Date('2026-09-03T10:00:00Z');

const record = (
    over: Partial<AiAnalyticsFeedbackRecord>,
): AiAnalyticsFeedbackRecord => ({
    id: '7001',
    createdAt: new Date('2026-09-03T07:00:00Z'),
    status: 'done',
    kind: 'useful',
    object: 'call:5',
    managerId: '20',
    transcriptionId: '5',
    requesterUserId: '447',
    reason: null,
    ...over,
});

const request = (kind: 'useful' | 'not_useful') => ({
    domain: 'd',
    requesterUserId: '447',
    kind,
    object: 'call:5',
    managerId: '20',
    transcriptionId: '5',
});

/**
 * Стор в памяти: add кладёт актуальную запись, supersede гасит, выборка
 * дня отдаёт только актуальные (как listInPeriod по умолчанию).
 */
function withMemoryStore() {
    const stand = makeFeedbackUseCase();
    const rows: AiAnalyticsFeedbackRecord[] = [];
    stand.store.add.mockImplementation((input: AiAnalyticsFeedbackInput) => {
        const id = String(8001 + rows.length);
        rows.push(
            record({
                id,
                kind: input.kind,
                createdAt: new Date(NOW.getTime() + rows.length * 1000),
            }),
        );
        return Promise.resolve(id);
    });
    stand.store.listInPeriod.mockImplementation(() =>
        Promise.resolve(rows.filter(row => row.status !== 'superseded')),
    );
    stand.store.supersede.mockImplementation((ids: readonly string[]) => {
        for (const row of rows) {
            if (ids.includes(row.id)) row.status = 'superseded';
        }
        return Promise.resolve([...ids]);
    });
    return { ...stand, rows };
}

describe('FeedbackUseCase: оценка useful / not_useful — один слот в день', () => {
    it('смена оценки пишет новую запись и гасит прежнюю оценку слота', async () => {
        const { useCase, store } = makeFeedbackUseCase([record({})]);

        const result = await useCase.add(request('not_useful'), leader, NOW);

        expect(result).toEqual({ id: '9001' });
        expect(store.add).toHaveBeenCalledTimes(1);
        expect(store.supersede).toHaveBeenCalledWith(['7001']);
    });

    it('клик той же оценкой, что последняя за день, → её id, без записи', async () => {
        const { useCase, store } = makeFeedbackUseCase([
            record({ id: '7001', kind: 'useful' }),
            record({
                id: '7002',
                kind: 'not_useful',
                createdAt: new Date('2026-09-03T08:00:00Z'),
            }),
        ]);

        const result = await useCase.add(request('not_useful'), leader, NOW);

        expect(result).toEqual({ id: '7002' });
        expect(store.add).not.toHaveBeenCalled();
        expect(store.supersede).not.toHaveBeenCalled();
    });

    it('useful → not_useful → useful: актуальной остаётся одна оценка useful', async () => {
        const { useCase, store, rows } = withMemoryStore();

        await useCase.add(request('useful'), leader, NOW);
        await useCase.add(request('not_useful'), leader, NOW);
        const last = await useCase.add(request('useful'), leader, NOW);
        const again = await useCase.add(request('useful'), leader, NOW);

        const active = rows.filter(row => row.status !== 'superseded');
        expect(active.map(row => [row.id, row.kind])).toEqual([
            [last.id, 'useful'],
        ]);
        expect(rows).toHaveLength(3);
        expect(again).toEqual(last);
        expect(store.add).toHaveBeenCalledTimes(3);
    });

    it('сбой замещения не роняет ответ: реакция записана, в лог — warn', async () => {
        const warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
        const { useCase, store } = makeFeedbackUseCase([record({})]);
        store.supersede.mockRejectedValueOnce(new Error('db down'));

        const result = await useCase.add(request('not_useful'), leader, NOW);

        expect(result).toEqual({ id: '9001' });
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});

describe('decideFeedbackWrite (чистое решение по записям дня)', () => {
    const key = (kind: 'useful' | 'not_useful') => ({
        kind,
        object: 'call:5',
        requesterUserId: '0447',
    });

    it('слот — только оценки того же автора и объекта; alert_handled и disagree не в слоте', () => {
        const decision = decideFeedbackWrite(
            [
                record({ id: '1', kind: 'useful' }),
                record({ id: '2', kind: 'disagree' }),
                record({ id: '3', kind: 'alert_handled' }),
                record({ id: '4', kind: 'useful', requesterUserId: '448' }),
                record({ id: '5', kind: 'useful', requesterUserId: null }),
            ],
            key('not_useful'),
        );

        expect(decision).toEqual({ action: 'write', supersedeIds: ['1'] });
    });

    it('последняя — по created_at, при равенстве по числовому id (10 новее 9)', () => {
        const at = new Date('2026-09-03T07:00:00Z');
        const records = [
            record({ id: '10', kind: 'not_useful', createdAt: at }),
            record({ id: '9', kind: 'useful', createdAt: at }),
        ];

        expect(decideFeedbackWrite(records, key('not_useful'))).toEqual({
            action: 'reuse',
            id: '10',
        });
        expect(decideFeedbackWrite(records, key('useful'))).toEqual({
            action: 'write',
            supersedeIds: ['10', '9'],
        });
    });

    it('виды без дедупликации пишутся без выборки дня', () => {
        expect(isRateFeedbackKind('useful')).toBe(true);
        expect(isRateFeedbackKind('not_useful')).toBe(true);
        expect(isRateFeedbackKind('alert_handled')).toBe(false);
        expect(needsSameDayLookup('alert_handled')).toBe(true);
        expect(needsSameDayLookup('disagree')).toBe(false);
        expect(needsSameDayLookup('view')).toBe(false);
        expect(
            decideFeedbackWrite([record({ kind: 'disagree' })], {
                kind: 'disagree',
                object: 'call:5',
                requesterUserId: '447',
            }),
        ).toEqual({ action: 'write', supersedeIds: [] });
    });
});
