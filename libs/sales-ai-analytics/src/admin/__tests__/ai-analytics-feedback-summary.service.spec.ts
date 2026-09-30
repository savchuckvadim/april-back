import { AiEntityDto } from '@lib/call-lib';
import { AI_ANALYTICS_FEEDBACK_TYPE } from '../../contracts/feedback.types';
import { AiAnalyticsAdminSnapshotStore } from '../ai-analytics-admin-snapshot.store';
import { AiAnalyticsFeedbackSummaryService } from '../services/ai-analytics-feedback-summary.service';

const DOMAIN = 'april.bitrix24.ru';

function feedback(partial: {
    id: string;
    kind: unknown;
    managerId?: string | null;
    status?: string;
}): AiEntityDto {
    return {
        id: partial.id,
        type: AI_ANALYTICS_FEEDBACK_TYPE,
        domain: DOMAIN,
        activity_id: '2026-09-10',
        model: '',
        status: partial.status ?? 'done',
        user_id: 0,
        tokens_count: 0,
        price: 0,
        createdAt: new Date('2026-09-10T10:00:00.000Z'),
        user_result: {
            kind: partial.kind,
            object: 'pulse',
            managerId: partial.managerId ?? null,
        },
    } as unknown as AiEntityDto;
}

function makeService(records: AiEntityDto[]) {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    const store = new AiAnalyticsAdminSnapshotStore(aiService as never);
    return {
        service: new AiAnalyticsFeedbackSummaryService(store),
        aiService,
    };
}

describe('AiAnalyticsFeedbackSummaryService', () => {
    it('считает по видам и по менеджерам, окно — обе границы включительно', async () => {
        const { service, aiService } = makeService([
            feedback({ id: '1', kind: 'useful', managerId: '154' }),
            feedback({ id: '2', kind: 'useful', managerId: '154' }),
            feedback({ id: '3', kind: 'not_useful', managerId: '200' }),
            feedback({ id: '4', kind: 'digest_sent', managerId: '154' }),
        ]);
        const result = await service.summary(
            DOMAIN,
            '2026-09-01',
            '2026-09-21',
        );
        expect(result.total).toBe(4);
        expect(result.skipped).toBe(0);
        expect(result.byKind).toEqual([
            { kind: 'useful', count: 2 },
            { kind: 'not_useful', count: 1 },
            { kind: 'digest_sent', count: 1 },
        ]);
        expect(result.byManager).toEqual([
            {
                managerId: '154',
                total: 3,
                byKind: [
                    { kind: 'useful', count: 2 },
                    { kind: 'digest_sent', count: 1 },
                ],
            },
            {
                managerId: '200',
                total: 1,
                byKind: [{ kind: 'not_useful', count: 1 }],
            },
        ]);

        const [domain, types, from, to] = aiService.findByDomainTypesInPeriod
            .mock.calls[0] as [string, string[], Date, Date];
        expect(domain).toBe(DOMAIN);
        expect(types).toEqual([AI_ANALYTICS_FEEDBACK_TYPE]);
        expect(from).toEqual(new Date('2026-09-01T00:00:00.000Z'));
        // Верхняя граница — конец дня `to`, чтобы день входил целиком.
        expect(to).toEqual(new Date('2026-09-22T00:00:00.000Z'));
    });

    it('доля полезных: useful / (useful + not_useful + disagree), проценты', async () => {
        const { service } = makeService([
            feedback({ id: '1', kind: 'useful' }),
            feedback({ id: '2', kind: 'useful' }),
            feedback({ id: '3', kind: 'not_useful' }),
            feedback({ id: '4', kind: 'disagree' }),
            // Доставки в знаменатель не входят.
            feedback({ id: '5', kind: 'digest_sent' }),
            feedback({ id: '6', kind: 'view' }),
        ]);
        const result = await service.summary(
            DOMAIN,
            '2026-09-01',
            '2026-09-21',
        );
        expect(result.usefulRatePct).toBe(Math.round((2 / 4) * 1000) / 10);
    });

    it('оценок не было — доля null, счётчики остаются', async () => {
        const { service } = makeService([
            feedback({ id: '1', kind: 'view' }),
            feedback({ id: '2', kind: 'agenda_sent' }),
        ]);
        const result = await service.summary(
            DOMAIN,
            '2026-09-01',
            '2026-09-21',
        );
        expect(result.usefulRatePct).toBeNull();
        expect(result.total).toBe(2);
    });

    it('запись с неизвестным видом идёт в skipped, а не в счётчики', async () => {
        const { service } = makeService([
            feedback({ id: '1', kind: 'useful' }),
            feedback({ id: '2', kind: 'чужой-вид' }),
            feedback({ id: '3', kind: 42 }),
        ]);
        const result = await service.summary(
            DOMAIN,
            '2026-09-01',
            '2026-09-21',
        );
        expect(result.total).toBe(1);
        expect(result.skipped).toBe(2);
    });

    it('замещённые записи не считаются: ни в счётчиках, ни в доле, ни в skipped', async () => {
        const { service } = makeService([
            feedback({ id: '1', kind: 'useful', managerId: '154' }),
            // Смена оценки за день: прежняя оценка ушла в superseded.
            feedback({
                id: '2',
                kind: 'not_useful',
                managerId: '154',
                status: 'superseded',
            }),
            // Пустой статус старых записей — актуальная запись.
            feedback({
                id: '3',
                kind: 'disagree',
                managerId: '200',
                status: '',
            }),
            // Замещённая запись чужой формы — тоже только в superseded.
            feedback({ id: '4', kind: 'чужой', status: 'superseded' }),
        ]);
        const result = await service.summary(
            DOMAIN,
            '2026-09-01',
            '2026-09-21',
        );
        expect(result.total).toBe(2);
        expect(result.skipped).toBe(0);
        expect(result.superseded).toBe(2);
        expect(result.byKind).toEqual([
            { kind: 'useful', count: 1 },
            { kind: 'disagree', count: 1 },
        ]);
        expect(result.usefulRatePct).toBe(50);
    });

    it('записей нет — нули и пустые разрезы', async () => {
        const { service } = makeService([]);
        const result = await service.summary(
            DOMAIN,
            '2026-09-01',
            '2026-09-21',
        );
        expect(result).toEqual({
            domain: DOMAIN,
            from: '2026-09-01',
            to: '2026-09-21',
            total: 0,
            skipped: 0,
            superseded: 0,
            byKind: [],
            byManager: [],
            usefulRatePct: null,
        });
    });
});
