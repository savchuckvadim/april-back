import { ForbiddenException } from '@nestjs/common';
import {
    findSameDayReaction,
    isDailyOnceFeedbackKind,
} from '../domain/use-cases/feedback-dedup.util';
import {
    feedbackResetScopes,
    resetFeedbackCaches,
} from '../domain/use-cases/feedback-cache-reset.util';
import type { AiAnalyticsFeedbackRecord } from '../store/ai-analytics-feedback.store';
import {
    FEEDBACK_LEADER as leader,
    FEEDBACK_MANAGER as manager,
    makeFeedbackUseCase,
} from './fixtures/feedback-use-case.fixture';

/** Четверг 03.09.2026 13:00 MSK — день портала 2026-09-03. */
const NOW = new Date('2026-09-03T10:00:00Z');
const DAY_FROM = new Date('2026-09-02T21:00:00.000Z');
const DAY_TO = new Date('2026-09-03T20:59:59.999Z');

const PULSE_PATTERN = 'sales-ai-analytics:v1:d:pulse:*';
const AGENDA_PATTERN = 'sales-ai-analytics:v1:d:agenda:*';

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

const request = (
    kind: 'useful' | 'not_useful' | 'disagree' | 'alert_handled',
) => ({
    domain: 'd',
    requesterUserId: '447',
    kind,
    object: 'call:5',
    managerId: '20',
    transcriptionId: '5',
});

describe('FeedbackUseCase: идемпотентность реакций за день', () => {
    it('повтор useful того же автора по тому же объекту сегодня → id прежней записи, без записи', async () => {
        const { useCase, store, cache } = makeFeedbackUseCase([record({})]);

        const result = await useCase.add(request('useful'), leader, NOW);

        expect(result).toEqual({ id: '7001' });
        expect(store.listInPeriod).toHaveBeenCalledWith('d', DAY_FROM, DAY_TO);
        expect(store.add).not.toHaveBeenCalled();
        expect(cache.resetByPattern).not.toHaveBeenCalled();
    });

    it('повтор alert_handled того же дня тоже не пишется повторно', async () => {
        const { useCase, store } = makeFeedbackUseCase([
            record({ id: '7002', kind: 'alert_handled' }),
        ]);

        const result = await useCase.add(request('alert_handled'), leader, NOW);

        expect(result).toEqual({ id: '7002' });
        expect(store.add).not.toHaveBeenCalled();
    });

    it('другой автор или объект — это новая реакция, пишется без замещения', async () => {
        const { useCase, store } = makeFeedbackUseCase([
            record({ id: '7001', requesterUserId: '448' }),
            record({ id: '7002', object: 'call:6' }),
            record({ id: '7003', kind: 'not_useful', object: 'call:6' }),
        ]);

        const result = await useCase.add(request('useful'), leader, NOW);

        expect(result).toEqual({ id: '9001' });
        expect(store.add).toHaveBeenCalledTimes(1);
        expect(store.supersede).not.toHaveBeenCalled();
    });

    it('disagree не дедуплицируется: повтор с новой причиной пишется, лишней выборки нет', async () => {
        const { useCase, store } = makeFeedbackUseCase([
            record({ kind: 'disagree' }),
        ]);

        await useCase.add(request('disagree'), leader, NOW);

        expect(store.listInPeriod).not.toHaveBeenCalled();
        expect(store.add).toHaveBeenCalledTimes(1);
    });

    it('менеджер: повтор своей реакции тоже возвращает прежний id', async () => {
        const { useCase, store } = makeFeedbackUseCase([
            record({ requesterUserId: '512', managerId: '512' }),
        ]);

        const result = await useCase.add(
            { ...request('useful'), requesterUserId: '512' },
            manager,
            NOW,
        );

        expect(result).toEqual({ id: '7001' });
        expect(store.add).not.toHaveBeenCalled();
    });

    it('чужой менеджер вне периметра — 403 раньше поиска дубля', async () => {
        const { useCase, store } = makeFeedbackUseCase([record({})]);

        await expect(
            useCase.add({ ...request('useful'), managerId: '99' }, leader, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(store.listInPeriod).not.toHaveBeenCalled();
    });
});

describe('FeedbackUseCase: сброс кэша витрины после записи', () => {
    it('alert_handled сбрасывает кэш пульса домена', async () => {
        const { useCase, cache } = makeFeedbackUseCase();

        await useCase.add(request('alert_handled'), leader, NOW);

        expect(cache.resetByPattern).toHaveBeenCalledTimes(1);
        expect(cache.resetByPattern).toHaveBeenCalledWith(PULSE_PATTERN);
    });

    it('disagree сбрасывает кэш повестки домена', async () => {
        const { useCase, cache } = makeFeedbackUseCase();

        await useCase.add(request('disagree'), leader, NOW);

        expect(cache.resetByPattern).toHaveBeenCalledTimes(1);
        expect(cache.resetByPattern).toHaveBeenCalledWith(AGENDA_PATTERN);
    });

    it('useful / not_useful / view кэш не трогают', async () => {
        const { useCase, cache } = makeFeedbackUseCase();

        await useCase.add(request('useful'), leader, NOW);
        await useCase.add(request('not_useful'), leader, NOW);
        await useCase.add({ ...request('useful'), kind: 'view' }, leader, NOW);

        expect(cache.resetByPattern).not.toHaveBeenCalled();
    });

    it('сбой кэша не отменяет записанную реакцию', async () => {
        const { useCase, cache, store } = makeFeedbackUseCase();
        cache.resetByPattern.mockRejectedValue(new Error('redis down'));

        const result = await useCase.add(request('alert_handled'), leader, NOW);

        expect(result).toEqual({ id: '9001' });
        expect(store.add).toHaveBeenCalledTimes(1);
    });
});

describe('feedback-dedup.util / feedback-cache-reset.util', () => {
    it('«один раз в день» — только alert_handled; оценки — отдельный слот', () => {
        expect(isDailyOnceFeedbackKind('alert_handled')).toBe(true);
        expect(isDailyOnceFeedbackKind('useful')).toBe(false);
        expect(isDailyOnceFeedbackKind('not_useful')).toBe(false);
        expect(isDailyOnceFeedbackKind('disagree')).toBe(false);
        expect(isDailyOnceFeedbackKind('view')).toBe(false);
    });

    it('автор сравнивается как Bitrix-id; запись push-контура (без автора) не дубль', () => {
        const key = {
            kind: 'useful' as const,
            object: 'call:5',
            requesterUserId: '0447',
        };
        expect(findSameDayReaction([record({})], key)?.id).toBe('7001');
        expect(
            findSameDayReaction([record({ requesterUserId: null })], key),
        ).toBeNull();
    });

    it('карта секций: alert_handled → pulse, disagree → agenda, прочее — ничего', async () => {
        expect(feedbackResetScopes('alert_handled')).toEqual(['pulse']);
        expect(feedbackResetScopes('disagree')).toEqual(['agenda']);
        expect(feedbackResetScopes('useful')).toEqual([]);
        const cache = { resetByPattern: jest.fn().mockResolvedValue(0) };
        const logger = { warn: jest.fn() };
        await resetFeedbackCaches(cache as never, 'd', 'agenda_sent', logger);
        expect(cache.resetByPattern).not.toHaveBeenCalled();
        cache.resetByPattern.mockRejectedValueOnce(new Error('boom'));
        await resetFeedbackCaches(cache as never, 'd', 'disagree', logger);
        expect(logger.warn).toHaveBeenCalledTimes(1);
    });
});
