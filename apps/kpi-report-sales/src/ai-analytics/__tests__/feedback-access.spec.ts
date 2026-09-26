import { ForbiddenException } from '@nestjs/common';
import {
    AI_ANALYTICS_FEEDBACK_KINDS,
    type AiAnalyticsFeedbackKind,
} from '@lib/sales-ai-analytics';
import {
    AI_ANALYTICS_SERVICE_FEEDBACK_KINDS,
    AI_ANALYTICS_USER_FEEDBACK_KINDS,
} from '../constants/ai-feedback.const';
import { isServiceFeedbackKind } from '../domain/use-cases/feedback-visibility.util';
import type { AiAnalyticsFeedbackRecord } from '../store/ai-analytics-feedback.store';
import {
    FEEDBACK_CUP as cup,
    FEEDBACK_LEADER as leader,
    FEEDBACK_MANAGER as manager,
    makeFeedbackUseCase,
} from './fixtures/feedback-use-case.fixture';

const NOW = new Date('2026-09-03T10:00:00Z');

const record = (
    id: string,
    kind: AiAnalyticsFeedbackKind,
    managerId: string | null,
): AiAnalyticsFeedbackRecord => ({
    id,
    createdAt: new Date('2026-09-03T07:00:00Z'),
    status: 'done',
    kind,
    object: 'call:5',
    managerId,
    transcriptionId: '5',
    requesterUserId: '447',
    reason: null,
});

/** Реакции периметра, чужого менеджера, без менеджера и служебные записи. */
const periodRecords = () => [
    record('1', 'useful', '10'),
    record('2', 'disagree', '20'),
    record('3', 'not_useful', '99'),
    record('4', 'view', null),
    record('5', 'alert_sent', '10'),
    record('6', 'digest_sent', '20'),
    record('7', 'agenda_sent', null),
    record('8', 'rop_mark', '10'),
];

const period = {
    domain: 'd',
    requesterUserId: '447',
    from: '2026-09-01',
    to: '2026-09-30',
};

const ids = (items: readonly { id: string }[]) => items.map(item => item.id);

describe('FeedbackUseCase: alert_handled — только руководителям', () => {
    const alertHandled = {
        domain: 'd',
        requesterUserId: '512',
        kind: 'alert_handled' as const,
        object: 'call:5',
        transcriptionId: '5',
    };

    it('менеджер → 403 до выборки и записи', async () => {
        const { useCase, store } = makeFeedbackUseCase();

        await expect(
            useCase.add(alertHandled, manager, NOW),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(store.listInPeriod).not.toHaveBeenCalled();
        expect(store.add).not.toHaveBeenCalled();
    });

    it('руководитель группы (group) отмечает «Отработано»', async () => {
        const { useCase, store } = makeFeedbackUseCase();

        const result = await useCase.add(
            { ...alertHandled, requesterUserId: '447', managerId: '20' },
            { role: 'group', visibleManagerIds: ['20', '447'] },
            NOW,
        );

        expect(result).toEqual({ id: '9001' });
        expect(store.add).toHaveBeenCalledTimes(1);
    });

    it('менеджер по-прежнему ставит свои useful / disagree', async () => {
        const { useCase, store } = makeFeedbackUseCase();

        await useCase.add({ ...alertHandled, kind: 'useful' }, manager, NOW);
        await useCase.add({ ...alertHandled, kind: 'disagree' }, manager, NOW);

        expect(store.add).toHaveBeenCalledTimes(2);
    });
});

describe('FeedbackUseCase.list: периметр и служебные виды', () => {
    it('op без managerId — только менеджеры периметра, без строк без менеджера и служебных', async () => {
        const { useCase } = makeFeedbackUseCase(periodRecords());

        const data = await useCase.list(period, leader);

        expect(ids(data.items)).toEqual(['1', '2']);
        expect(data.disagreementSharePct).toBe(50);
    });

    it('cup без managerId — все менеджеры и строки без менеджера, но без служебных', async () => {
        const { useCase } = makeFeedbackUseCase(periodRecords());

        const data = await useCase.list(period, cup);

        expect(ids(data.items)).toEqual(['1', '2', '3', '4']);
    });

    it('список по одному менеджеру тоже без служебных видов', async () => {
        const { useCase, store } = makeFeedbackUseCase([
            record('1', 'useful', '10'),
            record('5', 'alert_sent', '10'),
            record('8', 'rop_mark', '10'),
        ]);

        const data = await useCase.list({ ...period, managerId: '10' }, leader);

        expect(store.listInPeriod).toHaveBeenCalledWith(
            'd',
            expect.any(Date),
            expect.any(Date),
            '10',
        );
        expect(ids(data.items)).toEqual(['1']);
    });

    it('служебные и пользовательские виды вместе покрывают весь справочник', () => {
        const all = [
            ...AI_ANALYTICS_USER_FEEDBACK_KINDS,
            ...AI_ANALYTICS_SERVICE_FEEDBACK_KINDS,
        ].sort();
        expect(all).toEqual([...AI_ANALYTICS_FEEDBACK_KINDS].sort());
        expect(isServiceFeedbackKind('rop_mark')).toBe(true);
        expect(isServiceFeedbackKind('view')).toBe(false);
    });
});
