import {
    EnumColdCallEntityType,
    EnumColdCallIsTmc,
} from '../../cold-hook/dto/cold.dto';
import { LeadColdCallQueryDto } from '../dto/lead-cold.dto';
import { LeadColdEndpointService } from '../services/lead-cold-endpoint.service';

/**
 * Реальный ColdHooksHandlerService тянет транзитивно
 * @/apps/event-sales/shared (event-comment.service.tsx), который jest
 * не резолвит (moduleFileExtensions без tsx). В юните он всё равно
 * подменяется моком, поэтому модуль замокан целиком.
 */
jest.mock(
    '../../cold-hook/services/silence/cold-hooks-handler.service',
    () => ({ ColdHooksHandlerService: class ColdHooksHandlerService {} }),
);

describe('LeadColdEndpointService', () => {
    const createMocks = () => {
        const bitrix = {
            lead: {
                get: jest.fn().mockResolvedValue({
                    result: { ID: 10, TITLE: 'ООО Ромашка', COMPANY_ID: '55' },
                }),
                update: jest.fn().mockResolvedValue({ result: 1 }),
            },
            company: {
                set: jest.fn(),
                update: jest.fn().mockResolvedValue({ result: 1 }),
            },
        };
        const pbx = { init: jest.fn().mockResolvedValue({ bitrix }) };
        const hooksHandler = {
            handleHooks: jest.fn().mockResolvedValue(undefined),
        };
        return { bitrix, pbx, hooksHandler };
    };

    const dto: LeadColdCallQueryDto = {
        leadId: 10,
        deadline: '01.07.2026 02:14:00',
        assigned: '123',
        name: 'Холодный звонок',
    };

    it('передаёт в общий cold-обработчик один хук по компании лида', async () => {
        const { pbx, hooksHandler } = createMocks();
        const service = new LeadColdEndpointService(
            pbx as never,
            hooksHandler as never,
        );

        await service.createLeadColdCall('gsr.bitrix24.ru', dto);

        expect(pbx.init).toHaveBeenCalledWith('gsr.bitrix24.ru');
        expect(hooksHandler.handleHooks).toHaveBeenCalledTimes(1);
        const [domain, collected] = hooksHandler.handleHooks.mock.calls[0] as [
            string,
            Record<string, unknown>,
        ];
        expect(domain).toBe('gsr.bitrix24.ru');
        const hooks = Object.values(collected);
        expect(hooks).toHaveLength(1);
        expect(hooks[0]).toEqual({
            entityType: EnumColdCallEntityType.COMPANY,
            entityId: '55',
            responsible: '123',
            created: '1',
            deadline: '01.07.2026 02:14:00',
            name: 'Холодный звонок',
            isTmc: EnumColdCallIsTmc.N,
        });
    });

    it('возвращает processed=true с companyId существующей компании', async () => {
        const { pbx, hooksHandler } = createMocks();
        const service = new LeadColdEndpointService(
            pbx as never,
            hooksHandler as never,
        );

        const result = await service.createLeadColdCall('gsr.bitrix24.ru', dto);

        expect(result.processed).toBe(true);
        expect(result.domain).toBe('gsr.bitrix24.ru');
        expect(result.leadId).toBe(10);
        expect(result.companyId).toBe(55);
        expect(result.companyCreated).toBe(false);
        expect(result.rawDeadline).toBe('01.07.2026 02:14:00');
    });

    it('создаёт компанию и ставит звонок по ней, если у лида нет COMPANY_ID', async () => {
        const { bitrix, pbx, hooksHandler } = createMocks();
        bitrix.lead.get.mockResolvedValue({
            result: { ID: 10, TITLE: 'ООО Ромашка', COMPANY_ID: '' },
        });
        bitrix.company.set.mockResolvedValue({ result: 77 });
        const service = new LeadColdEndpointService(
            pbx as never,
            hooksHandler as never,
        );

        const result = await service.createLeadColdCall('gsr.bitrix24.ru', dto);

        expect(result.companyId).toBe(77);
        expect(result.companyCreated).toBe(true);
        const [, collected] = hooksHandler.handleHooks.mock.calls[0] as [
            string,
            Record<string, { entityId: string }>,
        ];
        expect(Object.values(collected)[0].entityId).toBe('77');
    });

    it('не вызывает cold-обработчик, если лид не найден', async () => {
        const { bitrix, pbx, hooksHandler } = createMocks();
        bitrix.lead.get.mockResolvedValue({ result: undefined });
        const service = new LeadColdEndpointService(
            pbx as never,
            hooksHandler as never,
        );

        await expect(
            service.createLeadColdCall('gsr.bitrix24.ru', dto),
        ).rejects.toBeDefined();
        expect(hooksHandler.handleHooks).not.toHaveBeenCalled();
    });
});
