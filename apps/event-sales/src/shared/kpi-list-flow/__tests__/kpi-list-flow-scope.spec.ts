import { Logger } from '@nestjs/common';
import { IBatchGroupBuffer } from '../../batch/batch-group-buffer.interface';
import {
    KPI_LIST_FLOW_SCOPE,
    KpiListFlowService,
} from '../services/kpi-list-flow.service';
import { KpiEventPayload } from '../type/kpi-event-payload.type';

type ListType = 'kpi' | 'history';

const IBLOCK_ID: Record<ListType, number> = { kpi: 55, history: 56 };
const ENTITY_ID = 7;

const makeList = (type: ListType) => ({
    type,
    group: 'sales',
    bitrixId: IBLOCK_ID[type],
    bitrixfields: [
        { code: `sales_${type}_crm`, bitrixCamelId: `P_${type}_CRM` },
    ],
});

interface AddCall {
    cmd: string;
    dto: Record<string, unknown>;
}

/** `configured` — какие списки есть на портале. */
const makeDeps = (configured: readonly ListType[]) => {
    const adds: AddCall[] = [];
    const bitrix = {
        batch: {
            listItem: {
                add: (cmd: string, dto: Record<string, unknown>) =>
                    adds.push({ cmd, dto }),
            },
        },
    };
    const portal = {
        getListByCode: (code: string) => {
            const type = code === 'sales_kpi' ? 'kpi' : 'history';
            return configured.includes(type) ? makeList(type) : undefined;
        },
    };
    const buffer: IBatchGroupBuffer = {
        queue: enqueue => enqueue(),
        endGroup: () => Promise.resolve(),
        flush: () => Promise.resolve(),
        getResults: () => [],
        getCurrentGroupSize: () => adds.length,
        getBufferSize: () => adds.length,
    };
    const service = new KpiListFlowService(bitrix as never, portal as never);
    return { service, adds, buffer };
};

const payload: KpiEventPayload = { name: 'КП', values: {}, items: {} };

/**
 * Параметр `scope` решает, в какие списки уходит событие: обычное — в «ОП
 * KPI» и «ОП История», документ конструктора — только в историю (в KPI он
 * засчитывается отдельной дедуплицированной записью). Без параметра
 * поведение прежнее — оба списка.
 */
describe('KpiListFlowService.flow — scope: в какие списки писать', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        warn = jest
            .spyOn(Logger.prototype, 'warn')
            .mockImplementation(() => undefined);
    });

    afterEach(() => jest.restoreAllMocks());

    // Старые вызовы без scope работают как прежде — в оба списка.
    describe('по умолчанию', () => {
        it('команды добавления уходят в оба списка — kpi и history', () => {
            const { service, adds, buffer } = makeDeps(['kpi', 'history']);

            const refs = service.flow(payload, ENTITY_ID, buffer);

            expect(adds.map(add => add.dto.IBLOCK_ID)).toEqual(['55', '56']);
            expect(refs.map(ref => ref.listType)).toEqual(['kpi', 'history']);
        });

        it('явный scope «both» ведёт себя так же, как отсутствие параметра', () => {
            const implicit = makeDeps(['kpi', 'history']);
            const explicit = makeDeps(['kpi', 'history']);

            implicit.service.flow(payload, ENTITY_ID, implicit.buffer);
            explicit.service.flow(payload, ENTITY_ID, explicit.buffer, {
                scope: KPI_LIST_FLOW_SCOPE.both,
            });

            expect(explicit.adds).toHaveLength(2);
            expect(explicit.adds.map(add => add.dto.IBLOCK_ID)).toEqual(
                implicit.adds.map(add => add.dto.IBLOCK_ID),
            );
        });
    });

    // Документ конструктора идёт только в ленту истории.
    describe('scope «history»', () => {
        it('пишет только в список history — одна команда', () => {
            const { service, adds, buffer } = makeDeps(['kpi', 'history']);

            service.flow(payload, ENTITY_ID, buffer, {
                scope: KPI_LIST_FLOW_SCOPE.history,
            });

            expect(adds).toHaveLength(1);
            expect(adds[0].dto.IBLOCK_ID).toBe('56');
            expect(adds[0].cmd).toMatch(/^add_list_item_history_7_/);
            expect(adds[0].dto.ELEMENT_CODE).toMatch(/^history_7_/);
            expect(adds[0].dto.FIELDS).toEqual({ NAME: 'КП' });
        });

        it('возвращает одну ссылку на команду — с типом списка history', () => {
            const { service, adds, buffer } = makeDeps(['kpi', 'history']);

            const refs = service.flow(payload, ENTITY_ID, buffer, {
                scope: KPI_LIST_FLOW_SCOPE.history,
            });

            expect(refs).toEqual([
                {
                    listType: 'history',
                    iblockId: 56,
                    crmFieldId: 'P_history_CRM',
                    cmd: adds[0].cmd,
                },
            ]);
        });

        it('списка history на портале нет — команд нет, ссылок нет, в журнале предупреждение', () => {
            const { service, adds, buffer } = makeDeps(['kpi']);

            const refs = service.flow(payload, ENTITY_ID, buffer, {
                scope: KPI_LIST_FLOW_SCOPE.history,
            });

            expect(adds).toEqual([]);
            expect(refs).toEqual([]);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('не настроены'),
            );
        });
    });
});
