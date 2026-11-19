import {
    ForbiddenException,
    HttpException,
    HttpStatus,
    NotFoundException,
} from '@nestjs/common';
import type { CallPageLeadPayload } from '@lib/call-lib';
import type { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import type { RequesterAccess } from '../../domain/access/perimeter.util';
import type { RequesterAccessService } from '../../domain/access/requester-access.service';
import type {
    AiAnalyticsCallReviewStore,
    AiCallReviewRecord,
} from '../../store/ai-analytics-call-review.store';
import type {
    CallPageLeadAccess,
    CallPageLeadContext,
} from '../call-page-lead.access';
import { CallPageLeadUseCase } from '../call-page-lead.use-case';
import type { CallPageManagerNameService } from '../call-page-manager-name.service';
import type { CallReviewRateLimiter } from '../call-review-rate-limit';
import type { CallPageLeadReviewRequestDto } from '../dto/call-page-lead.dto';

const DOMAIN = 'gsr.bitrix24.ru';

const LEAD: CallPageLeadPayload = {
    v: 1,
    d: DOMAIN,
    u: '10',
    r: 'leader',
    t: '10245',
    e: 1_790_000_000,
};

const ANALYSIS = {
    id: '900',
    type: 'agent-analysis',
    status: 'done',
    transcription_id: '10245',
    user_result: { score: 6, weightedScore: 64 },
};

const contextOf = (records: unknown[] = [ANALYSIS]): CallPageLeadContext =>
    ({
        call: {
            domain: DOMAIN,
            row: { id: '10245', userId: '0447' },
            records,
        },
        lead: LEAD,
    }) as unknown as CallPageLeadContext;

const reviewOf = (
    authorId: string,
    fields: Partial<AiCallReviewRecord> = {},
): AiCallReviewRecord => ({
    id: `r${authorId}`,
    createdAt: new Date('2026-11-19T08:00:00.000Z'),
    authorId,
    transcriptionId: '10245',
    managerId: '447',
    agree: true,
    leaderScore: 7,
    aiScore: 6.4,
    analysisId: '900',
    items: [],
    comment: '',
    authorRole: 'leader',
    authorName: `Автор ${authorId}`,
    ...fields,
});

const LEADER: RequesterAccess = { role: 'op', visibleManagerIds: ['447'] };

function harness(
    access: RequesterAccess = LEADER,
    context: CallPageLeadContext = contextOf(),
) {
    const leadAccess = { open: jest.fn(() => Promise.resolve(context)) };
    const accessService = { resolve: jest.fn(() => Promise.resolve(access)) };
    const store = {
        listForCall: jest.fn(() =>
            Promise.resolve([reviewOf('11'), reviewOf('10', { agree: false })]),
        ),
        save: jest.fn(() => Promise.resolve({ id: 'new', replacedIds: [] })),
    };
    const names = { nameOf: jest.fn(() => Promise.resolve('Петров Пётр')) };
    const rate = { tryConsume: jest.fn(() => Promise.resolve(true)) };
    const cache = { resetByPattern: jest.fn(() => Promise.resolve(1)) };
    const useCase = new CallPageLeadUseCase(
        leadAccess as unknown as CallPageLeadAccess,
        accessService as unknown as RequesterAccessService,
        store as unknown as AiAnalyticsCallReviewStore,
        names as unknown as CallPageManagerNameService,
        rate as unknown as CallReviewRateLimiter,
        cache as unknown as AiAnalyticsCacheService,
    );
    return { useCase, accessService, store, rate, cache };
}

const dtoOf = (
    fields: Partial<CallPageLeadReviewRequestDto> = {},
): CallPageLeadReviewRequestDto => ({
    agree: false,
    leaderScore: 4,
    items: [
        {
            kind: 'section',
            ref: ' NEEDS ',
            label: ' Выяснение потребностей ',
            comment: ' не выяснял ',
        },
    ],
    comment: '  Оценка завышена  ',
    ...fields,
});

describe('CallPageLeadUseCase.view', () => {
    it('мой отзыв отдельно, коллеги — без моего; право — по структуре', async () => {
        const { useCase, accessService } = harness();

        const view = await useCase.view('call', 'lead');

        expect(accessService.resolve).toHaveBeenCalledWith(DOMAIN, '10');
        expect(view.viewer).toEqual({
            name: 'Петров Пётр',
            role: 'leader',
            canReview: true,
            expiresAt: new Date(LEAD.e * 1000).toISOString(),
        });
        expect(view.mine?.agree).toBe(false);
        expect(view.colleagues.map(review => review.authorName)).toEqual([
            'Автор 11',
        ]);
    });

    it('права больше нет (стал менеджером) — отзывы не отдаются', async () => {
        const { useCase, store } = harness({
            role: 'manager',
            visibleManagerIds: ['10'],
        });

        const view = await useCase.view('call', 'lead');

        expect(view.viewer.canReview).toBe(false);
        expect(view.mine).toBeNull();
        expect(view.colleagues).toEqual([]);
        expect(store.listForCall).not.toHaveBeenCalled();
    });
});

describe('CallPageLeadUseCase.save', () => {
    it('сохраняет свой отзыв со снимком оценки AI и сбрасывает кэш списка', async () => {
        const { useCase, store, cache } = harness();

        const view = await useCase.save('call', 'lead', dtoOf());

        expect(store.save).toHaveBeenCalledWith({
            domain: DOMAIN,
            transcriptionId: '10245',
            managerId: '447',
            authorId: '10',
            review: {
                agree: false,
                leaderScore: 4,
                aiScore: 6.4,
                analysisId: '900',
                items: [
                    {
                        kind: 'section',
                        ref: 'NEEDS',
                        label: 'Выяснение потребностей',
                        comment: 'не выяснял',
                    },
                ],
                comment: 'Оценка завышена',
                authorRole: 'leader',
                authorName: 'Петров Пётр',
            },
        });
        expect(cache.resetByPattern).toHaveBeenCalledWith(
            `sales-ai-analytics:v1:${DOMAIN}:call-list:*`,
        );
        expect(view.viewer.canReview).toBe(true);
    });

    it('суперпользователю писать можно', async () => {
        const { useCase, store } = harness({
            role: 'cup',
            visibleManagerIds: null,
            isSuperUser: true,
        });
        await useCase.save('call', 'lead', dtoOf({ leaderScore: null }));
        expect(store.save).toHaveBeenCalledTimes(1);
    });

    it('право перепроверяется: руководитель чужого сотрудника — 403', async () => {
        const { useCase, store } = harness({
            role: 'op',
            visibleManagerIds: ['512'],
        });
        await expect(useCase.save('call', 'lead', dtoOf())).rejects.toThrow(
            new ForbiddenException(
                'Оставить отзыв может руководитель этого сотрудника',
            ),
        );
        expect(store.save).not.toHaveBeenCalled();
    });

    it('менеджер — 403', async () => {
        const { useCase } = harness({
            role: 'manager',
            visibleManagerIds: ['447'],
        });
        await expect(
            useCase.save('call', 'lead', dtoOf()),
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('чаще 10 в минуту — 429, ничего не пишется', async () => {
        const { useCase, rate, store } = harness();
        rate.tryConsume.mockResolvedValueOnce(false);
        const error = await useCase
            .save('call', 'lead', dtoOf())
            .catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(
            HttpStatus.TOO_MANY_REQUESTS,
        );
        expect(store.save).not.toHaveBeenCalled();
    });

    it('у звонка нет разбора — 404', async () => {
        const { useCase } = harness(LEADER, contextOf([]));
        await expect(
            useCase.save('call', 'lead', dtoOf()),
        ).rejects.toBeInstanceOf(NotFoundException);
    });
});
