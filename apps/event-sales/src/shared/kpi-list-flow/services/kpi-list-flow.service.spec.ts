import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { IPBXList } from '@lib/portal/interfaces/portal.interface';
import { ColdHookBatchGroupBuffer } from '../../../cold-hook/services/batch/cold-hook-batch-group-buffer';
import { KpiListFlowService } from './kpi-list-flow.service';
import { KpiEventPayload } from '../type/kpi-event-payload.type';

interface AddDto {
    IBLOCK_ID: string;
    ELEMENT_CODE: string;
    FIELDS: Record<string, unknown>;
}
type AddCall = [string, AddDto];
type AddMock = jest.Mock<void, AddCall>;

const buildList = (
    group: string,
    type: string,
    bitrixId: string,
): IPBXList => ({
    group,
    type,
    bitrixId,
    title: 'L',
    name: 'l',
    bitrixfields: [
        {
            type: 'string',
            code: `${group}_${type}_event_title`,
            name: 'Название',
            title: 'Название',
            bitrixId: 'PROPERTY_1',
            bitrixCamelId: 'PROPERTY_1',
            items: [],
        },
    ],
});

const buildPayload = (): KpiEventPayload => ({
    name: 'event-name',
    values: { event_title: 'event-name' },
    items: {},
});

interface MockBuffer {
    queue: jest.Mock;
    queued: (() => void)[];
}

const createBuffer = (): MockBuffer => {
    const queued: (() => void)[] = [];
    return {
        queue: jest.fn((fn: () => void) => queued.push(fn)),
        queued,
    };
};

const createBitrixMock = () => {
    const add = jest.fn() as unknown as AddMock;
    const bitrix = {
        batch: { listItem: { add } },
    } as unknown as BitrixService;
    return { bitrix, add };
};

describe('KpiListFlowService', () => {
    it('ставит в очередь две команды add для kpi и history списков', () => {
        const { bitrix, add } = createBitrixMock();
        const portal = {
            getListByCode: jest.fn((code: string) =>
                code === 'sales_kpi'
                    ? buildList('sales', 'kpi', '10')
                    : buildList('sales', 'history', '20'),
            ),
        } as unknown as PortalModel;
        const buffer = createBuffer();

        const service = new KpiListFlowService(bitrix, portal);
        service.flow(
            buildPayload(),
            123,
            buffer as unknown as ColdHookBatchGroupBuffer,
        );
        buffer.queued.forEach(fn => fn());

        expect(buffer.queue).toHaveBeenCalledTimes(2);
        expect(add).toHaveBeenCalledTimes(2);

        const [kpiCall, historyCall]: AddCall[] = add.mock.calls;
        const [kpiCmd, kpiDto] = kpiCall;
        const [historyCmd, historyDto] = historyCall;

        expect(kpiCmd).toMatch(/^add_list_item_kpi_123_/);
        expect(historyCmd).toMatch(/^add_list_item_history_123_/);
        expect(kpiDto.IBLOCK_ID).toBe('10');
        expect(historyDto.IBLOCK_ID).toBe('20');
        expect(kpiDto.FIELDS).toMatchObject({
            NAME: 'event-name',
            PROPERTY_1: 'event-name',
        });
    });

    it('коды элементов kpi и history содержат одинаковый уникальный суффикс', () => {
        const { bitrix, add } = createBitrixMock();
        const portal = {
            getListByCode: jest.fn((code: string) =>
                code === 'sales_kpi'
                    ? buildList('sales', 'kpi', '10')
                    : buildList('sales', 'history', '20'),
            ),
        } as unknown as PortalModel;
        const buffer = createBuffer();

        new KpiListFlowService(bitrix, portal).flow(
            buildPayload(),
            7,
            buffer as unknown as ColdHookBatchGroupBuffer,
        );
        buffer.queued.forEach(fn => fn());

        const [, kpiDto] = add.mock.calls[0];
        const [, historyDto] = add.mock.calls[1];

        const kpiSuffix = kpiDto.ELEMENT_CODE.replace(/^kpi_7_/, '');
        const historySuffix = historyDto.ELEMENT_CODE.replace(
            /^history_7_/,
            '',
        );
        expect(kpiSuffix).toBe(historySuffix);
        expect(kpiSuffix.length).toBeGreaterThan(0);
    });

    it('пропускает отсутствующий список без падения', () => {
        const { bitrix, add } = createBitrixMock();
        const portal = {
            getListByCode: jest.fn((code: string) =>
                code === 'sales_kpi'
                    ? buildList('sales', 'kpi', '10')
                    : undefined,
            ),
        } as unknown as PortalModel;
        const buffer = createBuffer();

        new KpiListFlowService(bitrix, portal).flow(
            buildPayload(),
            1,
            buffer as unknown as ColdHookBatchGroupBuffer,
        );
        buffer.queued.forEach(fn => fn());

        expect(add).toHaveBeenCalledTimes(1);
    });

    it('ничего не делает, если ни одного списка нет', () => {
        const { bitrix, add } = createBitrixMock();
        const portal = {
            getListByCode: jest.fn(() => undefined),
        } as unknown as PortalModel;
        const buffer = createBuffer();

        new KpiListFlowService(bitrix, portal).flow(
            buildPayload(),
            1,
            buffer as unknown as ColdHookBatchGroupBuffer,
        );

        expect(buffer.queue).not.toHaveBeenCalled();
        expect(add).not.toHaveBeenCalled();
    });
});
