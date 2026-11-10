import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { KpiEventPayload } from '../../shared/kpi-list-flow/type/kpi-event-payload.type';
import { EventReportKpiFlowService } from '../services/kpi-list/event-report-kpi-flow.service';

/*
 * gsirk 10.11.2026, компания 410377: основная сделка 278763 создана тем же
 * отчётом. Коды уникальных презентаций `410377_$result[set_base_deal]_plan`
 * и `…_done` Битрикс обрезал до `410377_278763` — первая запись легла с
 * неверным кодом, вторая упала «Element already exists». Теперь такие
 * записи уходят второй волной с настоящим номером сделки.
 */

const mockFlowDedup = jest.fn<Promise<void>, [KpiEventPayload, unknown]>(() =>
    Promise.resolve(),
);
const mockFlow = jest.fn(() => []);
let mockPayloads: KpiEventPayload[] = [];

jest.mock('../../shared/kpi-list-flow/services/kpi-list-flow.service', () => ({
    KpiListFlowService: class {
        flowDedup(payload: KpiEventPayload, buffer: unknown): Promise<void> {
            return mockFlowDedup(payload, buffer);
        }
        flow(): unknown[] {
            return mockFlow();
        }
    },
}));

jest.mock('../services/kpi-list/event-report-kpi-payload.builder', () => ({
    EventReportKpiPayloadBuilder: class {
        buildAll(): KpiEventPayload[] {
            return mockPayloads;
        }
    },
}));

const unique = (key: string): KpiEventPayload => ({
    name: 'Незапланированная презентация',
    values: { crm: { n0: 'CO_410377', n1: 'D_$result[set_base_deal]' } },
    items: { event_type: 'presentation_uniq' },
    dedup: { key, scope: 'kpi', mode: 'insert-once' },
});

const makeService = () => {
    const callBatchWithConcurrency = jest.fn(() => Promise.resolve([]));
    const bitrix = { api: { callBatchWithConcurrency }, batch: {} };
    const service = new EventReportKpiFlowService(bitrix as never, {} as never);
    return { service, callBatchWithConcurrency };
};

const answer = (
    result: Record<string, unknown>,
): IBitrixBatchResponseResult[] =>
    [{ result, result_error: [] }] as unknown as IBitrixBatchResponseResult[];

describe('EventReportKpiFlowService — уникальные от сделки этой же пачки', () => {
    beforeEach(() => {
        mockFlowDedup.mockClear();
        mockFlow.mockClear();
    });

    it('в основную пачку не идут — ждут её ответа', async () => {
        mockPayloads = [
            unique('410377_$result[set_base_deal]_plan'),
            unique('410377_$result[set_base_deal]_done'),
        ];
        const { service } = makeService();

        await service.queue(
            { entityId: 410377 } as never,
            {} as never,
            {} as never,
        );

        expect(mockFlowDedup).not.toHaveBeenCalled();
    });

    it('второй волной — с настоящим номером сделки, коды не сливаются', async () => {
        mockPayloads = [
            unique('410377_$result[set_base_deal]_plan'),
            unique('410377_$result[set_base_deal]_done'),
        ];
        const { service } = makeService();
        await service.queue(
            { entityId: 410377 } as never,
            {} as never,
            {} as never,
        );

        await service.flushDeferredUnique(answer({ set_base_deal: 278763 }));

        const written = mockFlowDedup.mock.calls.map(([payload]) => payload);
        expect(written.map(payload => payload.dedup?.key)).toEqual([
            '410377_278763_plan',
            '410377_278763_done',
        ]);
        expect(written[0].values.crm).toEqual({
            n0: 'CO_410377',
            n1: 'D_278763',
        });
    });

    it('сделка не создалась — уникальные пропущены, без исключения', async () => {
        mockPayloads = [unique('410377_$result[set_base_deal]_done')];
        const { service } = makeService();
        await service.queue(
            { entityId: 410377 } as never,
            {} as never,
            {} as never,
        );

        await expect(
            service.flushDeferredUnique(answer({})),
        ).resolves.toBeUndefined();
        expect(mockFlowDedup).not.toHaveBeenCalled();
    });

    it('код от известной сделки — как раньше, в основной пачке', async () => {
        mockPayloads = [unique('410377_278763_done')];
        const { service, callBatchWithConcurrency } = makeService();

        await service.queue(
            { entityId: 410377 } as never,
            {} as never,
            {} as never,
        );
        await service.flushDeferredUnique(answer({}));

        expect(mockFlowDedup).toHaveBeenCalledTimes(1);
        expect(callBatchWithConcurrency).not.toHaveBeenCalled();
    });
});
