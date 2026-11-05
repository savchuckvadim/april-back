import { BadRequestException } from '@nestjs/common';
import { RequisiteUpdateService } from '../services/requisite-update.service';
import { BxRqService } from '../services/BxRqService/services/bx-rq.service';
import { BxRqCustomFieldService } from '../services/BxRqService/services/bx-rq-custom-field.service';
import { ERQItem } from '../dto/erq-item.dto';
import { ERQField } from '../dto/erq-field.dto';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import { RQ_TYPE } from '../enums/rq-type.enum';
import { fakeBitrix, fakePbx, fakePortalModel, fakePresetService } from './helpers/rq-fakes';

const DOMAIN = 'april-garant.bitrix24.ru';
const COMPANY = 353;

const field = (code: string, value: string): ERQField => new ERQField({ code, value, type: 'string' });

const makeService = () => {
    const fake = fakeBitrix({
        'crm.requisite.userfield.list': {
            result: [
                { ID: '31', FIELD_NAME: 'UF_CRM_POSITION', XML_ID: 'position' },
                { ID: '32', FIELD_NAME: 'UF_CRM_1773131028', XML_ID: '' },
            ],
        },
    });
    const createRq = jest.fn().mockResolvedValue(501);
    const updateRq = jest.fn().mockResolvedValue(undefined);
    const bxRqService = { createRq, updateRq } as unknown as BxRqService;
    const service = new RequisiteUpdateService(
        fakePbx(fake.bitrix, fakePortalModel()),
        bxRqService,
        fakePresetService(),
        new BxRqCustomFieldService(),
    );
    return { service, createRq, updateRq };
};

describe('RequisiteUpdateService.updateRequisite', () => {
    it('новый ИП: заготовка по пресету запроса, поля и пользовательские поля уходят в createRq', async () => {
        const { service, createRq } = makeService();
        const item = new ERQItem({
            bx_id: -1,
            fields: [
                field('inn', '770123456789'),
                field('position', 'Директор'),
                field('base_other', 'ОГРНИП 123'),
            ],
        });

        const result = await service.updateRequisite(item, -1, [], COMPANY, DOMAIN, 4);

        expect(createRq).toHaveBeenCalledTimes(1);
        const sent = createRq.mock.calls[0][0] as BXRequisiteDTO;
        expect(sent.ID).toBe(-1);
        expect(sent.ENTITY_ID).toBe(COMPANY);
        expect(sent.PRESET_ID).toBe(4);
        expect(sent.NAME).toBe('Индивидуальный предприниматель');
        expect(sent.RQ_INN).toBe('770123456789');
        expect(sent.customFields?.map(custom => [custom.FIELD_NAME, custom.value])).toEqual([
            ['UF_CRM_POSITION', 'Директор'],
            ['UF_CRM_1773131028', 'ОГРНИП 123'],
        ]);
        expect(result.bx_id).toBe(501);
        expect(result.preset_id).toBe(4);
        expect(result.type).toBe(RQ_TYPE.IP);
    });

    it('пресет не передан и не из набора портала → BadRequest, Bitrix не трогается', async () => {
        const { service, createRq } = makeService();
        const item = new ERQItem({ bx_id: -1, fields: [field('inn', '1')] });

        await expect(service.updateRequisite(item, -1, [], COMPANY, DOMAIN, 1)).rejects.toBeInstanceOf(
            BadRequestException,
        );
        expect(createRq).not.toHaveBeenCalled();
    });

    it('существующий реквизит: правится найденный по id, уходит в updateRq', async () => {
        const { service, updateRq } = makeService();
        const existing = new BXRequisiteDTO({ ID: 77, ENTITY_ID: COMPANY, PRESET_ID: 2, RQ_INN: '1' });
        existing.customFields = [
            { ID: 31, FIELD_NAME: 'UF_CRM_POSITION', XML_ID: 'position', EDIT_FORM_LABEL: '', value: null },
        ];
        const item = new ERQItem({
            bx_id: 77,
            fields: [field('inn', '7701234567'), field('position', 'Генеральный директор')],
        });

        const result = await service.updateRequisite(item, 77, [existing], COMPANY, DOMAIN, undefined);

        expect(updateRq).toHaveBeenCalledWith(existing, 77, DOMAIN);
        expect(existing.RQ_INN).toBe('7701234567');
        expect(existing.customFields?.[0].value).toBe('Генеральный директор');
        expect(result.bx_id).toBe(77);
        expect(result.type).toBe(RQ_TYPE.ORGANIZATION);
    });

    it('bx_id не из списка компании → BadRequest', async () => {
        const { service } = makeService();
        const item = new ERQItem({ bx_id: 99, fields: [] });
        await expect(service.updateRequisite(item, 99, [], COMPANY, DOMAIN, undefined)).rejects.toThrow(
            'не найден',
        );
    });
});
