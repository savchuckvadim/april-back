import { BadRequestException } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxFieldWriteService } from '../domain/pbx-field-write.service';
import {
    EDITABLE_PBX_FIELDS,
    PBX_FIELD_ENTITY,
} from '../constants/pbx-fields.const';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';

/** Конфиг поля из EDITABLE_PBX_FIELDS по коду (в тестах он обязан быть). */
const configOf = (code: string) =>
    EDITABLE_PBX_FIELDS.find(field => field.code === code)!;

const CONTRACT_TYPE_FIELD = {
    code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
    bitrixId: 'CONTRACT_TYPE',
    items: [
        { code: 'garant_standart', name: 'Гарант Стандарт', bitrixId: 301 },
        { code: 'garant_prof', name: 'Гарант Проф', bitrixId: 302 },
    ],
};

const CONTRACT_START_FIELD = {
    code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_start,
    bitrixId: 'CONTRACT_START',
    type: 'date',
    items: [],
};

// На части порталов contract_* — datetime: дата пишется с полуночью.
const CONTRACT_END_FIELD = {
    code: PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_end,
    bitrixId: 'CONTRACT_END',
    type: 'datetime',
    items: [],
};

const CLIENT_TYPE_FIELD = {
    code: PBX_SALES_EVENT_FIELD_CODES.op_client_type,
    bitrixId: 'OP_CLIENT_TYPE',
    items: [{ code: 'commerc', name: 'Коммерческие', bitrixId: 401 }],
};

function makeMocks() {
    const dealUpdate = jest.fn().mockResolvedValue({ result: true });
    const companyUpdate = jest.fn().mockResolvedValue({ result: true });
    const bitrix = {
        deal: { update: dealUpdate },
        company: { update: companyUpdate },
    } as unknown as BitrixService;

    const portal = {
        getDealFieldByCode: jest.fn().mockImplementation((code: string) => {
            if (code === CONTRACT_TYPE_FIELD.code) return CONTRACT_TYPE_FIELD;
            if (code === CONTRACT_START_FIELD.code) return CONTRACT_START_FIELD;
            if (code === CONTRACT_END_FIELD.code) return CONTRACT_END_FIELD;
            return undefined;
        }),
        getCompanyFieldByCode: jest.fn().mockImplementation((code: string) => {
            if (code === CLIENT_TYPE_FIELD.code) return CLIENT_TYPE_FIELD;
            return undefined;
        }),
        getFieldBitrixId: jest
            .fn()
            .mockImplementation(
                (field: { bitrixId: string }) => `UF_CRM_${field.bitrixId}`,
            ),
    } as unknown as PortalModel;

    return { bitrix, portal, dealUpdate, companyUpdate };
}

describe('PbxFieldWriteService', () => {
    it('enum deal-поля: code элемента → numeric bitrixId в crm.deal.update', async () => {
        const { bitrix, portal, dealUpdate } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        const value = await service.write(
            configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type),
            2048,
            'garant_prof',
        );

        expect(value).toBe('garant_prof');
        expect(dealUpdate).toHaveBeenCalledWith(2048, {
            UF_CRM_CONTRACT_TYPE: 302,
        });
    });

    it('enum company-поля пишется через crm.company.update', async () => {
        const { bitrix, portal, companyUpdate, dealUpdate } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        await service.write(
            configOf(PBX_SALES_EVENT_FIELD_CODES.op_client_type),
            512,
            'commerc',
        );

        expect(companyUpdate).toHaveBeenCalledWith(512, {
            UF_CRM_OP_CLIENT_TYPE: 401,
        });
        expect(dealUpdate).not.toHaveBeenCalled();
    });

    it('date-поле (портальный тип date): ISO yyyy-MM-dd → DD.MM.YYYY', async () => {
        const { bitrix, portal, dealUpdate } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        await service.write(
            configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_start),
            100,
            '2026-03-01',
        );

        expect(dealUpdate).toHaveBeenCalledWith(100, {
            UF_CRM_CONTRACT_START: '01.03.2026',
        });
    });

    it('date-поле с портальным типом datetime пишется с полуночью', async () => {
        const { bitrix, portal, dealUpdate } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        await service.write(
            configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_end),
            100,
            '2027-02-28',
        );

        expect(dealUpdate).toHaveBeenCalledWith(100, {
            UF_CRM_CONTRACT_END: '28.02.2027 00:00:00',
        });
    });

    it('null очищает поле пустой строкой (без legacy-хаков)', async () => {
        const { bitrix, portal, dealUpdate } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        const value = await service.write(
            configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_start),
            100,
            null,
        );

        expect(value).toBeNull();
        expect(dealUpdate).toHaveBeenCalledWith(100, {
            UF_CRM_CONTRACT_START: '',
        });
    });

    it('невалидный code элемента enum → BadRequest, записи нет', async () => {
        const { bitrix, portal, dealUpdate } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        await expect(
            service.write(
                configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type),
                2048,
                'no_such_item',
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(dealUpdate).not.toHaveBeenCalled();
    });

    it('невалидный формат даты → BadRequest', async () => {
        const { bitrix, portal } = makeMocks();
        const service = new PbxFieldWriteService(bitrix, portal);

        await expect(
            service.write(
                configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_end),
                100,
                '01.03.2026',
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('поле не настроено на портале → BadRequest', async () => {
        const { bitrix, portal } = makeMocks();
        (
            portal.getDealFieldByCode as unknown as jest.Mock
        ).mockReturnValue(undefined);
        const service = new PbxFieldWriteService(bitrix, portal);

        await expect(
            service.write(
                configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type),
                2048,
                'garant_prof',
            ),
        ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('конфиг contract_end существует и является date deal-полем', () => {
        const config = configOf(PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_end);
        expect(config.entity).toBe(PBX_FIELD_ENTITY.deal);
        expect(config.confirm).toBe(true);
    });
});
