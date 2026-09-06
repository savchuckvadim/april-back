import { CallTypeStatsService } from '../services/call-type-stats.service';

const DOMAIN = 'test.bitrix24.ru';

const classify = (
    transcriptionId: string,
    callType: string,
    confidence: number,
    extra?: Record<string, unknown>,
) => ({
    id: `c-${transcriptionId}`,
    type: 'call-classify',
    transcription_id: transcriptionId,
    result: callType,
    user_result: {
        callType,
        confidence,
        reason: `потому что ${callType}`,
        ...extra,
    },
});

const analysis = (
    transcriptionId: string,
    callType: string,
    callTypeRefined: string | null,
) => ({
    id: `a-${transcriptionId}`,
    type: 'agent-analysis',
    transcription_id: transcriptionId,
    result: null,
    user_result: { callType, callTypeRefined },
});

const makeService = (records: Record<string, unknown>[]) => {
    const aiService = {
        findByDomainTypesInPeriod: jest.fn().mockResolvedValue(records),
    };
    return { service: new CallTypeStatsService(aiService as never), aiService };
};

describe('CallTypeStatsService', () => {
    it('считает распределение классификатора и итоговое, долю «другое», уверенность, приор и синтез', async () => {
        const { service, aiService } = makeService([
            classify('1', 'call', 0.9),
            classify('2', 'other', 0.4),
            analysis('2', 'presentation', 'presentation'),
            classify('3', 'presentation', 0.7, {
                priorApplied: true,
                originalCallType: 'other',
            }),
            analysis('3', 'presentation', null),
            classify('4', 'other', 0.5),
            analysis('4', 'other', null),
        ]);
        const from = new Date('2026-08-01T00:00:00Z');
        const to = new Date('2026-09-01T00:00:00Z');
        const stats = await service.collect(DOMAIN, from, to);

        expect(aiService.findByDomainTypesInPeriod).toHaveBeenCalledWith(
            DOMAIN,
            ['call-classify', 'agent-analysis'],
            from,
            to,
        );
        expect(stats.total).toBe(4);
        expect(stats.classifierByType).toEqual({
            call: 1,
            other: 2,
            presentation: 1,
        });
        // Звонок 2 уточнён синтезом: итог — презентация.
        expect(stats.finalByType).toEqual({
            call: 1,
            presentation: 2,
            other: 1,
        });
        expect(stats.otherSharePct).toBe(25);
        expect(stats.avgConfidence).toBe(0.63);
        expect(stats.lowConfidence).toBe(2);
        expect(stats.priorApplied).toBe(1);
        expect(stats.refinedBySynthesis).toBe(1);
        expect(stats.samples).toEqual([
            {
                transcriptionId: '4',
                classifierType: 'other',
                confidence: 0.5,
                finalType: 'other',
                reason: 'потому что other',
            },
        ]);
    });

    it('разбор без классификации: тип из разбора; пустая выборка — нули', async () => {
        const { service } = makeService([analysis('9', 'cold', null)]);
        const stats = await service.collect(DOMAIN, new Date(0), new Date());
        expect(stats.total).toBe(1);
        expect(stats.classifierByType).toEqual({});
        expect(stats.finalByType).toEqual({ cold: 1 });
        expect(stats.avgConfidence).toBeNull();

        const empty = await makeService([]).service.collect(
            DOMAIN,
            new Date(0),
            new Date(),
        );
        expect(empty.total).toBe(0);
        expect(empty.otherSharePct).toBe(0);
        expect(empty.samples).toEqual([]);
    });
});
