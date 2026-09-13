import { BitrixService, IBxRpaItem } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { SupplyDealFlowService } from '../services/supply-deal-flow.service';

/**
 * Поставка собирает сервисную сделку из RPA и базовой сделки отдела продаж.
 * Все поля резолвятся по кодам через pbx — никаких `UF_RPA_1_*` в коде.
 */
describe('SupplyDealFlowService', () => {
    const RPA_TYPE = 9;

    const rpa = {
        [`UF_RPA_${RPA_TYPE}_RPA_CRM_COMPANY`]: 555,
        [`UF_RPA_${RPA_TYPE}_RPA_CRM_CONTACTS`]: [11, 22],
        [`UF_RPA_${RPA_TYPE}_MANAGER_OS`]: 77,
        [`UF_RPA_${RPA_TYPE}_MANAGER_EDU`]: 88,
        [`UF_RPA_${RPA_TYPE}_RPA_ARM_CLIENT_ID`]: '61-40762-000996',
        [`UF_RPA_${RPA_TYPE}_RPA_ARM_COMPLECT_ID`]: ['4019-Юрист'],
        [`UF_RPA_${RPA_TYPE}_CONTRACT_END`]: '2026-09-21T00:00:00+03:00',
    } as unknown as IBxRpaItem;

    const portalModelWith = (
        over: Partial<Record<string, unknown>> = {},
    ): PortalModel =>
        ({
            getRpaFieldBitrixIdByCode: (_rpaCode: string, code: string) =>
                `UF_RPA_${RPA_TYPE}_${code.toUpperCase()}`,
            getDealFieldBitrixIdByCode: (code: string) =>
                `UF_CRM_${code.toUpperCase()}`,
            getDealCategoryByCode: () => ({ bitrixId: 5, stages: [] }),
            getDealStageByCode: () => ({ bitrixId: 'REG_ONE' }),
            ...over,
        }) as unknown as PortalModel;

    const bitrixWith = (over: Record<string, unknown> = {}): BitrixService =>
        ({
            deal: { get: jest.fn().mockResolvedValue({ result: {} }) },
            company: { update: jest.fn().mockResolvedValue({}) },
            contact: { update: jest.fn().mockResolvedValue({}) },
            ...over,
        }) as unknown as BitrixService;

    it('собирает контакты, ARM-идентификаторы и менеджера обучения', () => {
        const service = new SupplyDealFlowService(
            bitrixWith(),
            portalModelWith(),
        );

        const values = service.buildSupplyOnlyValues(rpa);

        expect(values.CONTACT_IDS).toEqual(['11', '22']);
        expect(values['UF_CRM_RPA_ARM_CLIENT_ID']).toBe('61-40762-000996');
        expect(values['UF_CRM_RPA_ARM_COMPLECT_ID']).toEqual(['4019-Юрист']);
        expect(values['UF_CRM_MANAGER_EDU']).toBe(88);
    });

    it('пустые поля RPA в сделку не пишет', () => {
        const service = new SupplyDealFlowService(
            bitrixWith(),
            portalModelWith(),
        );

        const values = service.buildSupplyOnlyValues({} as IBxRpaItem);

        expect(values).toEqual({});
    });

    it('чистит текущие договор, счёт и поставку', () => {
        const service = new SupplyDealFlowService(
            bitrixWith(),
            portalModelWith(),
        );

        expect(service.buildClearedDocumentValues()).toEqual({
            UF_CRM_CURRENT_CONTRACT: '',
            UF_CRM_CURRENT_INVOICE: '',
            UF_CRM_CURRENT_SUPLY: '',
        });
    });

    it('берёт из базовой сделки только непустые UF-поля и не трогает уже собранные', async () => {
        const bitrix = bitrixWith({
            deal: {
                get: jest.fn().mockResolvedValue({
                    result: {
                        ID: 100,
                        TITLE: 'Базовая',
                        UF_CRM_NOTE: 'важное',
                        UF_CRM_EMPTY: '',
                        UF_CRM_ZERO: 0,
                        UF_CRM_LIST: [],
                        UF_CRM_NOTE2: 'перетирать нельзя',
                    },
                }),
            },
        });
        const service = new SupplyDealFlowService(bitrix, portalModelWith());

        const values = await service.buildBaseDealValues(100, {
            UF_CRM_NOTE2: 'из RPA',
        });

        expect(values).toEqual({ UF_CRM_NOTE: 'важное' });
    });

    it('базовая сделка не прочиталась — пустой набор, а не падение', async () => {
        const bitrix = bitrixWith({
            deal: { get: jest.fn().mockResolvedValue({ result: null }) },
        });
        const service = new SupplyDealFlowService(bitrix, portalModelWith());

        expect(await service.buildBaseDealValues(100, {})).toEqual({});
    });

    it('ставит стадию сервисной воронки по остатку срока договора', () => {
        const service = new SupplyDealFlowService(
            bitrixWith(),
            portalModelWith(),
        );

        expect(service.resolveStageId(rpa)).toBe('C5:REG_ONE');
    });

    it('нет воронки service_base — стадию не ставим', () => {
        const service = new SupplyDealFlowService(
            bitrixWith(),
            portalModelWith({ getDealCategoryByCode: () => undefined }),
        );

        expect(service.resolveStageId(rpa)).toBeNull();
    });

    it('переводит ответственных у компании и контактов на менеджера ОРК', async () => {
        const companyUpdate = jest.fn().mockResolvedValue({});
        const contactUpdate = jest.fn().mockResolvedValue({});
        const service = new SupplyDealFlowService(
            bitrixWith({
                company: { update: companyUpdate },
                contact: { update: contactUpdate },
            }),
            portalModelWith(),
        );

        await service.updateParticipants(rpa);

        expect(companyUpdate).toHaveBeenCalledWith(555, {
            ASSIGNED_BY_ID: '77',
            UF_CRM_USER_CARDNUM: '61-40762-000996',
        });
        expect(contactUpdate).toHaveBeenCalledTimes(2);
        expect(contactUpdate).toHaveBeenCalledWith(11, {
            ASSIGNED_BY_ID: 77,
        });
    });

    it('без менеджера ОРК ответственных не трогает', async () => {
        const companyUpdate = jest.fn().mockResolvedValue({});
        const contactUpdate = jest.fn().mockResolvedValue({});
        const service = new SupplyDealFlowService(
            bitrixWith({
                company: { update: companyUpdate },
                contact: { update: contactUpdate },
            }),
            portalModelWith(),
        );

        await service.updateParticipants({} as IBxRpaItem);

        expect(companyUpdate).not.toHaveBeenCalled();
        expect(contactUpdate).not.toHaveBeenCalled();
    });
});
