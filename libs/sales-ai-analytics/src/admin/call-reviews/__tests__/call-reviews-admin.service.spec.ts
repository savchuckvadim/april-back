import { BadRequestException } from '@nestjs/common';
import type { AiService, CallPageLinkService } from '@lib/call-lib';
import type { CallReviewSourceRecord } from '../../../model/call-review/call-review.record';
import {
    reviewPayload,
    reviewRecord,
} from '../../../model/call-review/__tests__/call-review.fixtures';
import { CallReviewsAdminService } from '../call-reviews-admin.service';
import type { CallReviewsCallsReader } from '../call-reviews-calls.reader';
import type { CallReviewsAdminQueryDto } from '../dto/call-reviews-admin-query.dto';

const DOMAIN = 'gsr.bitrix24.ru';

function harness(records: CallReviewSourceRecord[]) {
    const ai = {
        findByDomainTypesInPeriod: jest.fn(() => Promise.resolve(records)),
    };
    const calls = {
        headsOf: jest.fn((_domain: string, ids: readonly string[]) =>
            Promise.resolve(
                new Map(
                    ids.map(id => [
                        id,
                        {
                            userId: '447',
                            userName: 'Иванова Мария',
                            callStartedAt: null,
                        },
                    ]),
                ),
            ),
        ),
    };
    const links = {
        urlsFor: jest.fn((_domain: string, ids: readonly string[]) =>
            Promise.resolve(
                new Map(
                    ids.map(id => [id, `https://report.example/call/${id}`]),
                ),
            ),
        ),
    };
    const service = new CallReviewsAdminService(
        ai as unknown as AiService,
        calls as unknown as CallReviewsCallsReader,
        links as unknown as CallPageLinkService,
    );
    return { service, ai, calls, links };
}

const query = (
    fields: Partial<CallReviewsAdminQueryDto> = {},
): CallReviewsAdminQueryDto => ({
    domain: DOMAIN,
    from: '2026-11-01',
    to: '2026-11-19',
    ...fields,
});

/** Пять звонков, по отзыву на каждый; 2 и 4 — «не согласен». */
const fiveReviews = (): CallReviewSourceRecord[] =>
    ['1', '2', '3', '4', '5'].map(id =>
        reviewRecord(id, {
            transcriptionId: `100${id}`,
            at: `2026-11-1${id}T09:00:00.000Z`,
            payload: reviewPayload({
                agree: id !== '2' && id !== '4',
                leaderScore: Number(id),
                aiScore: 5,
                items:
                    id === '4'
                        ? [
                              {
                                  kind: 'objection',
                                  ref: 'h1',
                                  label: '«Дорого»',
                                  comment: '',
                              },
                          ]
                        : [],
            }),
        }),
    );

describe('CallReviewsAdminService', () => {
    it('читает обратную связь портала за окно дней по Москве', async () => {
        const { service, ai } = harness([]);

        await service.page(query());

        expect(ai.findByDomainTypesInPeriod).toHaveBeenCalledWith(
            DOMAIN,
            ['ai-analytics-feedback'],
            new Date('2026-10-31T21:00:00.000Z'),
            new Date('2026-11-19T21:00:00.000Z'),
        );
    });

    it('страницы: свежие первыми, total под фильтром; ссылки и расшифровки — только для строк страницы', async () => {
        const { service, calls, links } = harness(fiveReviews());

        const result = await service.page(query({ page: 2, pageSize: 2 }));

        expect(result.items.map(row => row.transcriptionId)).toEqual([
            '1003',
            '1002',
        ]);
        expect(result).toMatchObject({ total: 5, page: 2, pageSize: 2 });
        expect(calls.headsOf).toHaveBeenCalledWith(DOMAIN, ['1003', '1002']);
        expect(links.urlsFor).toHaveBeenCalledWith(DOMAIN, ['1003', '1002']);
        expect(result.items[0]).toMatchObject({
            callUrl: 'https://report.example/call/1003',
            managerName: 'Иванова Мария',
        });
    });

    it('фильтры сужают список, а сводка остаётся по всему периоду', async () => {
        const { service } = harness(fiveReviews());

        const result = await service.page(
            query({ agree: 'no', itemKind: 'objection' }),
        );

        expect(result.items.map(row => row.transcriptionId)).toEqual(['1004']);
        expect(result.total).toBe(1);
        expect(result.summary).toMatchObject({
            total: 5,
            disagree: 2,
            disagreePct: 40,
            avgAiScore: 5,
            avgLeaderScore: 3,
            avgScoreDiff: -2,
        });
        expect(result.summary.topItems).toEqual([
            {
                kind: 'objection',
                kindTitle: 'возражение',
                label: '«Дорого»',
                count: 1,
            },
        ]);
    });

    it('замещённый отзыв не попадает ни в список, ни в сводку', async () => {
        const records = [
            reviewRecord('1', {
                status: 'superseded',
                payload: reviewPayload({ agree: false }),
            }),
            reviewRecord('2', { at: '2026-11-18T10:00:00.000Z' }),
        ];
        const { service } = harness(records);

        const result = await service.page(query());

        expect(result.items.map(row => row.id)).toEqual(['2']);
        expect(result.summary).toMatchObject({ total: 1, disagree: 0 });
    });

    it('отзыв ровно в полночь после последнего дня — уже чужой', async () => {
        const { service } = harness([
            reviewRecord('1', { at: '2026-11-19T21:00:00.000Z' }),
        ]);

        const result = await service.page(query());

        expect(result.total).toBe(0);
        expect(result.summary.total).toBe(0);
    });

    it('страница за пределами списка — пустая, общее число прежнее', async () => {
        const { service, links } = harness(fiveReviews());

        const result = await service.page(query({ page: 9, pageSize: 2 }));

        expect(result.items).toEqual([]);
        expect(result.total).toBe(5);
        expect(links.urlsFor).toHaveBeenCalledWith(DOMAIN, []);
    });

    it('начало периода позже конца — 400 с причиной словами', async () => {
        const { service, ai } = harness([]);

        await expect(
            service.page(query({ from: '2026-11-19', to: '2026-11-01' })),
        ).rejects.toThrow(
            new BadRequestException('Начало периода позже конца'),
        );
        expect(ai.findByDomainTypesInPeriod).not.toHaveBeenCalled();
    });
});
