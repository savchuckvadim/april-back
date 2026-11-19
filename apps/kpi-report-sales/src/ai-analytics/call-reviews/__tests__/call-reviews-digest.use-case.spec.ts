import type {
    AiEntityDto,
    AiService,
    CallPageLinkService,
} from '@lib/call-lib';
import type { AiAnalyticsPortalsLoader } from '../../domain/loaders/portals.loader';
import { CallReviewsDigestUseCase } from '../call-reviews-digest.use-case';

const NOW = new Date('2026-11-19T06:00:00.000Z');

const reviewRecord = (
    id: string,
    fields: {
        at?: string;
        status?: string;
        agree?: boolean;
        comment?: string;
        transcriptionId?: string;
    } = {},
): AiEntityDto => {
    const transcriptionId = fields.transcriptionId ?? `100${id}`;
    return {
        id,
        type: 'ai-analytics-feedback',
        status: fields.status ?? 'done',
        transcription_id: transcriptionId,
        createdAt: new Date(fields.at ?? '2026-11-18T09:00:00.000Z'),
        user_result: {
            kind: 'call_review',
            object: `call:${transcriptionId}`,
            managerId: '447',
            transcriptionId,
            requesterUserId: '12',
            reason: null,
            payload: {
                agree: fields.agree ?? true,
                leaderScore: 5,
                aiScore: 7,
                analysisId: '900',
                items: [],
                comment: fields.comment ?? 'Комментарий',
                authorRole: 'leader',
                authorName: 'Петров Пётр',
            },
        },
    } as unknown as AiEntityDto;
};

function harness(byDomain: Record<string, AiEntityDto[] | Error>) {
    const portals = {
        listDomains: jest.fn(() => Promise.resolve(Object.keys(byDomain))),
    };
    const ai = {
        findByDomainTypesInPeriod: jest.fn((domain: string) => {
            const records = byDomain[domain];
            return records instanceof Error
                ? Promise.reject(records)
                : Promise.resolve(records);
        }),
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
    const useCase = new CallReviewsDigestUseCase(
        portals as unknown as AiAnalyticsPortalsLoader,
        ai as unknown as AiService,
        links as unknown as CallPageLinkService,
    );
    return { useCase, ai, links };
}

describe('CallReviewsDigestUseCase', () => {
    it('читает отзывы каждого портала за прошлые сутки по Москве', async () => {
        const { useCase, ai } = harness({ 'gsr.bitrix24.ru': [] });

        const result = await useCase.build(NOW);

        expect(result).toEqual({ day: '2026-11-18', parts: null });
        expect(ai.findByDomainTypesInPeriod).toHaveBeenCalledWith(
            'gsr.bitrix24.ru',
            ['ai-analytics-feedback'],
            new Date('2026-11-17T21:00:00.000Z'),
            new Date('2026-11-18T21:00:00.000Z'),
        );
    });

    it('портал без отзывов и замещённые отзывы в сводку не попадают; ссылки — публичные', async () => {
        const { useCase, links } = harness({
            'gsr.bitrix24.ru': [
                reviewRecord('1', { agree: false, comment: 'Не так' }),
                reviewRecord('2', { status: 'superseded' }),
            ],
            'garant.bitrix24.ru': [reviewRecord('3', { status: 'superseded' })],
        });

        const { parts } = await useCase.build(NOW);

        expect(parts).toHaveLength(1);
        const text = (parts ?? [])[0];
        expect(text).toContain('gsr.bitrix24.ru: отзывов 1, не согласны 1');
        expect(text).toContain(
            '• Петров Пётр, не согласен, AI 7 → 5: Не так https://report.example/call/1001',
        );
        expect(text).not.toContain('garant.bitrix24.ru');
        expect(links.urlsFor).toHaveBeenCalledWith('gsr.bitrix24.ru', ['1001']);
    });

    it('отзыв ровно в полночь следующего дня — уже не в этой сводке', async () => {
        const { useCase } = harness({
            'gsr.bitrix24.ru': [
                reviewRecord('1', { at: '2026-11-18T21:00:00.000Z' }),
            ],
        });

        await expect(useCase.build(NOW)).resolves.toEqual({
            day: '2026-11-18',
            parts: null,
        });
    });

    it('сбой одного портала не роняет сводку остальных', async () => {
        const { useCase } = harness({
            'broken.bitrix24.ru': new Error('db'),
            'gsr.bitrix24.ru': [reviewRecord('1')],
        });

        const { parts } = await useCase.build(NOW);

        expect((parts ?? [])[0]).toContain('gsr.bitrix24.ru: отзывов 1');
    });
});
