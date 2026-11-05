import { BxRqService } from '../services/BxRqService/services/bx-rq.service';
import { BxRqAddressService } from '../services/BxRqService/services/bx-rq-address.service';
import { BxRqBankService } from '../services/BxRqService/services/bx-rq-bank.service';
import { BxRqCustomFieldService } from '../services/BxRqService/services/bx-rq-custom-field.service';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import {
    fakeBitrix,
    fakePbx,
    fakePortalModel,
    fakePresetService,
    PRESET_SET,
} from './helpers/rq-fakes';

const makeService = (answers: Record<string, unknown>) => {
    const fake = fakeBitrix(answers);
    const service = new BxRqService(
        fakePbx(fake.bitrix, fakePortalModel()),
        new BxRqAddressService(),
        new BxRqBankService(),
        new BxRqCustomFieldService(),
        fakePresetService(),
    );
    return { service, ...fake };
};

const methods = (call: jest.Mock): string[] => call.mock.calls.map(args => args[0] as string);

describe('BxRqService.getRq', () => {
    it('у компании нет реквизитов: три заготовки с пресетами портала, Bitrix не пишется', async () => {
        const { service, call } = makeService({ 'crm.requisite.list': { result: [] } });
        const rqs = await service.getRq(353, 'april-garant.bitrix24.ru');

        expect(rqs.map(rq => [rq.ID, rq.PRESET_ID, rq.NAME])).toEqual([
            [-1, 2, 'Организация'],
            [-1, 4, 'Индивидуальный предприниматель'],
            [-1, 6, 'Физическое лицо'],
        ]);
        expect(rqs[0].ENTITY_ID).toBe(353);
        expect(rqs[0].address?.map(item => item.TYPE)).toEqual([
            'Юридический адрес',
            'Фактический адрес',
        ]);
        expect(rqs[0].bank?.[0].ID).toBe(-1);
        expect(methods(call)).toEqual(['crm.requisite.list']);
    });

    it('есть реквизит: он числовой, заготовки дописаны для всех типов', async () => {
        const { service } = makeService({
            'crm.requisite.list': {
                result: [{ ID: '77', ENTITY_ID: '353', PRESET_ID: '2', RQ_COMPANY_FULL_NAME: 'ООО Ромашка' }],
            },
        });
        const rqs = await service.getRq(353, 'april-garant.bitrix24.ru');

        expect(rqs[0]).toBeInstanceOf(BXRequisiteDTO);
        expect(rqs[0].ID).toBe(77);
        expect(rqs[0].PRESET_ID).toBe(2);
        expect(rqs.filter(rq => rq.ID === -1).map(rq => rq.PRESET_ID)).toEqual([2, 4, 6]);
    });
});

describe('BxRqService.createRq', () => {
    it('в Bitrix уходят поля без служебных ключей заготовки; возвращается id', async () => {
        const { service, call } = makeService({ 'crm.requisite.add': { result: '501' } });
        const template = new BXRequisiteDTO({
            ID: -1,
            ENTITY_ID: 353,
            ENTITY_TYPE_ID: 4,
            PRESET_ID: PRESET_SET.ip.id,
            NAME: PRESET_SET.ip.name,
            RQ_INN: '7701234567',
        });
        template.customFields = [
            { ID: 1, FIELD_NAME: 'UF_CRM_POS', XML_ID: 'position', EDIT_FORM_LABEL: '', value: 'Директор' },
            { ID: 2, FIELD_NAME: 'UF_CRM_BASED', XML_ID: 'based', EDIT_FORM_LABEL: '', value: null },
        ];

        const id = await service.createRq(template, 'april-garant.bitrix24.ru');

        expect(id).toBe(501);
        const fields = call.mock.calls[0][1].fields as Record<string, unknown>;
        expect(fields).toMatchObject({
            ENTITY_ID: 353,
            ENTITY_TYPE_ID: 4,
            PRESET_ID: 4,
            NAME: PRESET_SET.ip.name,
            RQ_INN: '7701234567',
            UF_CRM_POS: 'Директор',
        });
        expect(fields).not.toHaveProperty('ID');
        expect(fields).not.toHaveProperty('customFields');
        expect(fields).not.toHaveProperty('UF_CRM_BASED');
    });

    it('ошибка Bitrix → BadRequest с её текстом', async () => {
        const { service } = makeService({
            'crm.requisite.add': { error: 'ERROR', error_description: 'Поле ИНН слишком длинное' },
        });
        await expect(
            service.createRq(new BXRequisiteDTO({ ID: -1 }), 'april-garant.bitrix24.ru'),
        ).rejects.toThrow('Поле ИНН слишком длинное');
    });
});
