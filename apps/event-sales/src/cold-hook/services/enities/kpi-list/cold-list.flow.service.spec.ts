import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal/services/portal.model';
import { IPBXList } from '@lib/portal/interfaces/portal.interface';
import { ETimeZone } from '@/shared/lib/date';
import { ColdHookBatchGroupBuffer } from '../../batch/cold-hook-batch-group-buffer';
import {
    ColdListFlowService,
    IColdListFlowData,
} from './cold-list.flow.service';

interface AddDto {
    IBLOCK_ID: string;
    ELEMENT_CODE: string;
    FIELDS: Record<string, unknown>;
}
type AddCall = [string, AddDto];
type AddMock = jest.Mock<void, AddCall>;

const buildList = (group: string, type: string): IPBXList => ({
    group,
    type,
    bitrixId: type === 'kpi' ? '10' : '20',
    title: type,
    name: type,
    bitrixfields: [
        {
            type: 'string',
            code: `${group}_${type}_event_title`,
            name: 'Название',
            title: 'Название',
            bitrixId: 'PROPERTY_TITLE',
            bitrixCamelId: 'PROPERTY_TITLE',
            items: [],
        },
        {
            type: 'enumeration',
            code: `${group}_${type}_event_type`,
            name: 'Тип',
            title: 'Тип',
            bitrixId: 'PROPERTY_TYPE',
            bitrixCamelId: 'PROPERTY_TYPE',
            items: [
                {
                    id: 1,
                    created_at: new Date(),
                    updated_at: new Date(),
                    bitrixfield_id: 1,
                    name: 'xo',
                    title: 'xo',
                    code: 'xo',
                    bitrixId: 7777,
                },
            ],
        },
        {
            type: 'crm',
            code: `${group}_${type}_crm`,
            name: 'CRM',
            title: 'CRM',
            bitrixId: 'PROPERTY_CRM',
            bitrixCamelId: 'PROPERTY_CRM',
            items: [],
        },
    ],
});

const baseData: IColdListFlowData = {
    name: 'от 26 мая 2026',
    deadline: '2026-05-27T08:00:00+03:00',
    createdId: '1',
    responsibleId: '2',
    companyId: '111',
    baseDealId: '500',
    xoDealId: '$result[new_cold_deal_111]',
};

const createBuffer = () => {
    const queued: (() => void)[] = [];
    return {
        queue: jest.fn((fn: () => void) => queued.push(fn)),
        queued,
    };
};

describe('ColdListFlowService', () => {
    it('собирает payload с event_type=xo / event_action=plan и отправляет в KPI+history', () => {
        const add = jest.fn() as unknown as AddMock;
        const bitrix = {
            batch: { listItem: { add } },
        } as unknown as BitrixService;

        const portal = {
            getListByCode: jest.fn((code: string) =>
                code === 'sales_kpi'
                    ? buildList('sales', 'kpi')
                    : buildList('sales', 'history'),
            ),
            getTimezone: jest.fn(() => 'Europe/Moscow' as ETimeZone),
        } as unknown as PortalModel;

        const buffer = createBuffer();
        const service = new ColdListFlowService(bitrix, portal);

        service.flow(baseData, buffer as unknown as ColdHookBatchGroupBuffer);
        buffer.queued.forEach(fn => fn());

        expect(add).toHaveBeenCalledTimes(2);

        const [, kpiDto] = add.mock.calls[0];
        expect(kpiDto.FIELDS.NAME).toBe(
            'Холодный звонок Запланирован от 26 мая 2026',
        );
        expect(kpiDto.FIELDS.PROPERTY_TITLE).toBe(
            'Холодный звонок Запланирован от 26 мая 2026',
        );
        expect(kpiDto.FIELDS.PROPERTY_TYPE).toBe(7777);
        expect(kpiDto.FIELDS.PROPERTY_CRM).toEqual({
            n0: 'CO_111',
            n1: 'D_500',
            n2: 'D_$result[new_cold_deal_111]',
        });
    });

    it('передаёт companyId в код элемента списка', () => {
        const add = jest.fn() as unknown as AddMock;
        const bitrix = {
            batch: { listItem: { add } },
        } as unknown as BitrixService;
        const portal = {
            getListByCode: jest.fn(() => buildList('sales', 'kpi')),
            getTimezone: jest.fn(() => 'Europe/Moscow' as ETimeZone),
        } as unknown as PortalModel;
        const buffer = createBuffer();

        new ColdListFlowService(bitrix, portal).flow(
            baseData,
            buffer as unknown as ColdHookBatchGroupBuffer,
        );
        buffer.queued.forEach(fn => fn());

        const [, dto] = add.mock.calls[0];
        expect(dto.ELEMENT_CODE.startsWith('kpi_111_')).toBe(true);
    });
});
