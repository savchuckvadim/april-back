import {
    AiAnalyticsRecommendationLogStore,
    leverObject,
    monthsPeriod,
} from '../store/ai-analytics-recommendation-log.store';

/**
 * Журнал выданных советов поверх записей обратной связи (поток B2b):
 * объект `lever:{managerId}:{ключ}`, дедуп по (менеджер, ключ, месяц),
 * окно эффекта — выдача месяца и реакции на неё.
 */
const KEY = 'volume:volume-gap:call::';

function makeStore(records: object[] = []) {
    const feedback = {
        listInPeriod: jest.fn().mockResolvedValue(records),
        add: jest.fn().mockResolvedValue('9001'),
    };
    return {
        store: new AiAnalyticsRecommendationLogStore(feedback as never),
        feedback,
    };
}

const issued = (
    managerId: string,
    key: string,
    monthKey: string,
    extra: Record<string, unknown> = {},
) => ({
    kind: 'recommendation_issued',
    object: leverObject(managerId, key),
    managerId,
    payload: { key, monthKey, lever: 'volume', ...extra },
});

describe('AiAnalyticsRecommendationLogStore', () => {
    it('объект совета: lever:{managerId}:{ключ}', () => {
        expect(leverObject('11', KEY)).toBe(`lever:11:${KEY}`);
    });

    it('период месяцев с запасом в сутки по обе стороны', () => {
        const period = monthsPeriod('2026-08', '2026-09');
        expect(period.from.toISOString()).toBe('2026-07-31T00:00:00.000Z');
        expect(period.to.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    });

    it('wasIssued: совпадение по объекту и месяцу из нагрузки', async () => {
        const { store, feedback } = makeStore([
            issued('11', KEY, '2026-09'),
            issued('12', KEY, '2026-08'),
        ]);
        const key = {
            domain: 'd',
            managerId: '11',
            key: KEY,
            monthKey: '2026-09',
        };
        await expect(store.wasIssued(key)).resolves.toBe(true);
        await expect(
            store.wasIssued({ ...key, managerId: '12' }),
        ).resolves.toBe(false);
        await expect(
            store.wasIssued({ ...key, key: 'quality:q:::' }),
        ).resolves.toBe(false);
        const [domain, from, to] = feedback.listInPeriod.mock.calls[0] as [
            string,
            Date,
            Date,
        ];
        expect(domain).toBe('d');
        expect(from.toISOString()).toBe('2026-08-31T00:00:00.000Z');
        expect(to.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    });

    it('чужие виды и битые записи выдачей не считаются', async () => {
        const { store } = makeStore([
            { ...issued('11', KEY, '2026-09'), kind: 'recommendation_done' },
            { ...issued('11', KEY, '2026-09'), object: 'lever:12:other' },
            { ...issued('11', KEY, '2026-09'), managerId: null },
            { ...issued('11', KEY, '2026-09'), payload: { key: KEY } },
        ]);
        await expect(store.issuedObjects('d', '2026-09')).resolves.toEqual(
            new Set(),
        );
    });

    it('markIssued: служебный вид, объект, менеджер и нагрузка с ключом и месяцем', async () => {
        const { store, feedback } = makeStore();
        const id = await store.markIssued(
            { domain: 'd', managerId: '11', key: KEY, monthKey: '2026-09' },
            {
                day: '2026-09-08',
                lever: 'volume',
                ruleCode: 'volume-gap',
                deltaSales: 1.5,
                ci80: [0.5, 2.5],
                evidence: 'E0',
                calcVersion: 'sam-1.0.0',
            },
        );
        expect(id).toBe('9001');
        expect(feedback.add).toHaveBeenCalledWith({
            domain: 'd',
            kind: 'recommendation_issued',
            object: `lever:11:${KEY}`,
            managerId: '11',
            transcriptionId: null,
            requesterUserId: null,
            reason: null,
            payload: {
                day: '2026-09-08',
                monthKey: '2026-09',
                key: KEY,
                lever: 'volume',
                ruleCode: 'volume-gap',
                deltaSales: 1.5,
                ci80: [0.5, 2.5],
                evidence: 'E0',
                calcVersion: 'sam-1.0.0',
            },
        });
    });

    it('readWindow: выдача месяца без дублей, «Сделано» и несогласие по объектам советов', async () => {
        const { store, feedback } = makeStore([
            issued('11', KEY, '2026-07'),
            issued('11', KEY, '2026-07'),
            issued('12', KEY, '2026-08'),
            // Рычаг восстанавливается из ключа, если в нагрузке его нет.
            issued('13', 'quality:q:::', '2026-07', { lever: undefined }),
            {
                kind: 'recommendation_done',
                object: leverObject('11', KEY),
                managerId: '11',
            },
            {
                kind: 'disagree',
                object: leverObject('13', 'quality:q:::'),
                managerId: '13',
            },
            { kind: 'disagree', object: 'overview:11', managerId: '11' },
        ]);
        const window = await store.readWindow('d', '2026-07', '2026-09');
        expect(window.issued.map(item => [item.managerId, item.lever])).toEqual(
            [
                ['11', 'volume'],
                ['13', 'quality'],
            ],
        );
        expect([...window.done]).toEqual([leverObject('11', KEY)]);
        expect([...window.disagree]).toEqual([
            leverObject('13', 'quality:q:::'),
        ]);
        const [, from, to] = feedback.listInPeriod.mock.calls[0] as [
            string,
            Date,
            Date,
        ];
        expect(from.toISOString()).toBe('2026-06-30T00:00:00.000Z');
        expect(to.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    });

    it('readWindow: реакция засчитывается только от менеджера самого совета', async () => {
        const { store } = makeStore([
            issued('11', KEY, '2026-07'),
            // Менеджер 12 по совету коллеги — не считается.
            {
                kind: 'recommendation_done',
                object: leverObject('11', KEY),
                managerId: '12',
            },
            // Запись без менеджера (руководитель не указал менеджера).
            {
                kind: 'disagree',
                object: leverObject('11', KEY),
                managerId: null,
            },
            // Префикс id: менеджер 1 не равен менеджеру 11.
            {
                kind: 'disagree',
                object: leverObject('11', KEY),
                managerId: '1',
            },
        ]);
        const window = await store.readWindow('d', '2026-07', '2026-09');
        expect(window.issued).toHaveLength(1);
        expect(window.done.size).toBe(0);
        expect(window.disagree.size).toBe(0);
    });
});
