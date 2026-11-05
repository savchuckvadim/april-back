import { RequisiteMapperService } from '../services/requisite-mapper.service';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import { Address } from '../types/bx-address.type';
import { Bank } from '../types/bx-bank.type';
import { RQ_TYPE } from '../enums/rq-type.enum';
import { fakeBitrix, fakePbx, fakePortalModel, fakePresetService } from './helpers/rq-fakes';

const DOMAIN = 'april-garant.bitrix24.ru';
const COMPANY = 353;

const makeMapper = () =>
    new RequisiteMapperService(
        fakePbx(fakeBitrix().bitrix, fakePortalModel()),
        fakePresetService(),
    );

const template = (presetId: number): BXRequisiteDTO =>
    new BXRequisiteDTO({ ID: -1, ENTITY_ID: COMPANY, PRESET_ID: presetId });

describe('RequisiteMapperService', () => {
    it('заготовки → default каждого типа; пустой тип показывает заготовку в items', async () => {
        const mapper = makeMapper();
        const dto = await mapper.mapBxRequisitesToErqDto(
            [template(2), template(4), template(6)],
            COMPANY,
            DOMAIN,
        );

        expect(dto.org?.default?.bx_id).toBe(-1);
        expect(dto.org?.default?.type).toBe(RQ_TYPE.ORGANIZATION);
        expect(dto.org?.default?.preset_id).toBe(2);
        expect(dto.ip?.default?.type).toBe(RQ_TYPE.IP);
        expect(dto.fiz?.default?.type).toBe(RQ_TYPE.FIZ);
        expect(dto.org?.items.map(item => item.bx_id)).toEqual([-1]);
        expect(dto.current).toBeNull();
        // в заготовке все поля типа, пустые
        const innField = dto.org?.default?.fields.find(field => field.code === 'inn');
        expect(innField?.value).toBe('');
    });

    it('реальные реквизиты в items, заготовка отдельно в default; пресет строкой тоже группируется', async () => {
        const mapper = makeMapper();
        const real = new BXRequisiteDTO({
            ID: '77' as unknown as number,
            ENTITY_ID: COMPANY,
            PRESET_ID: '2' as unknown as number,
            RQ_COMPANY_FULL_NAME: 'ООО Ромашка',
            RQ_INN: '7701234567',
        });
        real.address = [
            new Address({ TYPE_ID: 6, TYPE: 'Юридический адрес', ANCHOR_ID: COMPANY, CITY: 'Москва' }),
        ];
        real.bank = [new Bank({ ID: 5, RQ_BANK_NAME: 'Сбербанк' })];

        const dto = await mapper.mapBxRequisitesToErqDto([real, template(2), template(4)], COMPANY, DOMAIN);

        expect(dto.org?.items.map(item => item.bx_id)).toEqual([77]);
        expect(dto.org?.default?.bx_id).toBe(-1);
        expect(dto.current?.bx_id).toBe(77);
        expect(dto.org?.items[0].fields.find(field => field.code === 'inn')?.value).toBe('7701234567');
        expect(dto.org?.items[0].address?.items[0].fields.find(field => field.code === 'address_city')?.value).toBe(
            'Москва',
        );
        expect(dto.org?.items[0].bank?.current?.id).toBe(5);
    });

    it('без заготовки в списке default всё равно есть: пустой шаблон с адресами и банком', async () => {
        const mapper = makeMapper();
        const dto = await mapper.mapBxRequisitesToErqDto([], COMPANY, DOMAIN);

        expect(dto.fiz?.default?.bx_id).toBe(-1);
        expect(dto.fiz?.default?.preset_id).toBe(6);
        expect(dto.fiz?.default?.address?.items.map(item => item.type_id)).toEqual([6, 1]);
        expect(dto.fiz?.default?.bank?.current?.id).toBe(-1);
        expect(dto.fiz?.items).toHaveLength(1);
    });

    it('реквизит с чужим пресетом не попадает ни в одну группу', async () => {
        const mapper = makeMapper();
        const foreign = new BXRequisiteDTO({ ID: 90, ENTITY_ID: COMPANY, PRESET_ID: 1 });
        const dto = await mapper.mapBxRequisitesToErqDto([foreign], COMPANY, DOMAIN);

        expect(dto.org?.items.map(item => item.bx_id)).toEqual([-1]);
        expect(dto.current).toBeNull();
    });
});
