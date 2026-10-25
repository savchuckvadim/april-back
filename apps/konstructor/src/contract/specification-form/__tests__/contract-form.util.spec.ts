import { ComplectDto } from '@app/konstructor/document-generate/dto/complect/complect.dto';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';
import {
    RQ_TYPE,
    SupplyTypeEnum,
} from '@app/konstructor/document-generate/type/bx-rq.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    buildContractGeneralForm,
    buildSpecificationItems,
    filterSpecificationItems,
    supplyTextsForContract,
    type SpecificationInput,
} from '../lib/contract-form.util';
import { getContractIBlocks } from '../lib/contract-iblocks.util';

const block = (
    name: string,
    weight: number,
    extra: Partial<ComplectDto['value'][number]> = {},
) => ({
    name,
    checked: true,
    weight,
    ...extra,
});
const group = (
    type: INFOBLOCK_GROUP_TYPE,
    groupsName: string,
    value: ComplectDto['value'],
): ComplectDto => ({
    groupsName,
    type,
    value,
});

const complect: ComplectDto[] = [
    group(INFOBLOCK_GROUP_TYPE.NPA, 'Нормативно-правовые акты', [
        block('Законодательство России', 1),
        block('Законодательство России', 1), // дубль — в договор один раз
        block('Ставропольский край', 0.5, { isRegion: true }),
    ]),
    group(INFOBLOCK_GROUP_TYPE.LA, 'Судебная практика', [
        block('Практика высших судов', 1, { title: 'Практика ВС' }),
    ]),
    group(INFOBLOCK_GROUP_TYPE.FREE, 'Без дополнительной оплаты', [
        block('ПРАЙМ', 0),
    ]),
    group(INFOBLOCK_GROUP_TYPE.ER, 'Энциклопедии решений', [
        block('ЭР Договоры', 0.5),
        block('ЭР Налоги', 0),
    ]),
    group(INFOBLOCK_GROUP_TYPE.PER, 'Пакет Энциклопедий решений', [
        block('Пакет Бухгалтеру', 1),
    ]),
    group(INFOBLOCK_GROUP_TYPE.STAR, 'Дополнительные программные продукты', [
        block('СТАР', 0),
    ]),
    group(INFOBLOCK_GROUP_TYPE.LT, 'Legal Tech', [block('Сутяжник', 1)]),
    group(INFOBLOCK_GROUP_TYPE.ACADEMY, 'Академия', [
        block('Академия 3 часа', 0),
    ]),
];

describe('getContractIBlocks', () => {
    it('группы по type: содержательные — по весу без дублей, ЭР по весу, пакеты через запятую', () => {
        const iblocks = getContractIBlocks(complect);
        expect(iblocks.allIBlocks).toBe(
            'Законодательство России\nСтавропольский край\nПрактика ВС\n',
        );
        expect(iblocks.bigIBlocks).toBe(
            'Законодательство России\nПрактика ВС\n',
        );
        expect(iblocks.smallIBlocks).toBe('Ставропольский край\n');
        expect(iblocks.freeIBlocks).toBe('ПРАЙМ\n');
        expect(iblocks.ers).toBe('ЭР Договоры\n');
        expect(iblocks.ersInPacket).toBe('ЭР Налоги\n');
        expect(iblocks.erPackets).toBe('Пакет Бухгалтеру');
        expect(iblocks.starLtBlocks).toBe('СТАР\n');
    });

    it('без type группа узнаётся по легаси-названию', () => {
        const iblocks = getContractIBlocks([
            {
                groupsName: 'Без дополнительной оплаты',
                value: [block('ПРАЙМ', 0)],
            } as ComplectDto,
        ]);
        expect(iblocks.freeIBlocks).toBe('ПРАЙМ\n');
        expect(iblocks.allIBlocks).toBe('');
    });
});

describe('buildContractGeneralForm', () => {
    it('суммы по строкам: месяц, предоплата, год = месяц × 12; предоплата не для бюджетников', () => {
        const form = buildContractGeneralForm(
            [
                { month: 1000, sum: 12000, quantity: 12 },
                { month: 500, sum: 500, quantity: 1 },
            ],
            12,
        );
        const byCode = Object.fromEntries(
            form.map(item => [
                item['code' as keyof typeof item] as string,
                item,
            ]),
        );
        expect(byCode['month_sum'].value).toBe('1500');
        expect(byCode['prepayment_sum'].value).toBe('12500');
        expect(byCode['period_sum'].value).toBe('18000');
        expect(byCode['prepayment_sum'].includes).not.toContain(RQ_TYPE.BUDGET);
        expect(byCode['contract_start'].isRequired).toBe(true);
        expect(form).toHaveLength(11);
    });
});

describe('supplyTextsForContract', () => {
    const texts = {
        contractName: 'Многопользовательская Интернет-версия 5',
        contractPropComment: 'service comment',
        contractPropEmail: 'service email',
        contractPropLoginsQuantity: 'пять логинов',
        contractProp1: 'флэш',
        contractProp2: 'курьером',
        lcontractName: 'Лицензия Интернет 5',
        lcontractProp2: 'почтой',
        acontractName: 'Абонемент Интернет 5',
    };

    it('услуги — contract*, интернет получает «ОД»; лицензия — lcontract* с откатом; абонемент — acontract*', () => {
        expect(
            supplyTextsForContract(
                texts,
                CONTRACT_LTYPE.SERVICE,
                SupplyTypeEnum.INTERNET,
            ),
        ).toMatchObject({
            name: 'Многопользовательская Интернет-версия 5 ОД',
            comment: 'service comment',
            deliveryWay: 'курьером',
            loginsQuantity: 'пять логинов',
        });
        expect(
            supplyTextsForContract(
                texts,
                CONTRACT_LTYPE.LIC,
                SupplyTypeEnum.PROXIMA,
            ),
        ).toMatchObject({
            name: 'Лицензия Интернет 5',
            comment: 'service comment',
            deliveryWay: 'почтой',
        });
        expect(
            supplyTextsForContract(
                texts,
                CONTRACT_LTYPE.ABON,
                SupplyTypeEnum.INTERNET,
            ).name,
        ).toBe('Абонемент Интернет 5 ОД');
    });
});

describe('buildSpecificationItems + filter', () => {
    const input: SpecificationInput = {
        contractType: CONTRACT_LTYPE.SERVICE,
        supplyType: SupplyTypeEnum.INTERNET,
        supply: {
            name: 'Интернет 5 ОД',
            comment: 'c',
            email: 'e',
            loginsQuantity: 'пять',
            distributive: '',
            deliveryWay: '',
            quantityForKp: 'Интернет версия на 5 одновременных доступов',
        },
        contractCoefficient: 12,
        productNames: ['Гарант-Юрист', 'Гарант-Бухгалтер'],
        rows: [{ month: 1000, sum: 12000, quantity: 1 }],
        consalting: { name: 'Горячая Линия', prop: '', comment: '' },
        lt: {
            freePacket: 'LT Малый',
            freeServices: ['Сутяжник'],
            paidPacket: '',
            paidServices: [],
        },
        iblocks: getContractIBlocks(complect),
    };

    it('полный легаси-состав: 29 строк, значения из входа, активность LT по наличию', () => {
        const items = buildSpecificationItems(input);
        expect(items).toHaveLength(29);
        const byCode = Object.fromEntries(items.map(item => [item.code, item]));
        expect(byCode['complect_name'].value).toBe(
            'Гарант-Юрист \nГарант-Бухгалтер \n',
        );
        expect(byCode['specification_supply'].value).toBe('Интернет 5 ОД');
        expect(byCode['specification_lt_free'].isActive).toBe(true);
        expect(byCode['specification_lt_packet'].isActive).toBe(false);
        expect(byCode['specification_key_period'].value).toBe('12 мес.');
        expect(byCode['lic_long'].value).toBe(
            'Количество лицензий: 1\nСрок действия лицензии: 12 (месяц) ',
        );
    });

    it('фильтр по поставке/договору/клиенту: интернет-услуги без носителей и без лицензионных сроков', () => {
        const items = filterSpecificationItems(buildSpecificationItems(input), {
            supplyType: SupplyTypeEnum.INTERNET,
            contractType: CONTRACT_LTYPE.SERVICE,
            clientType: RQ_TYPE.ORGANIZATION,
        });
        const codes = items.map(item => item.code);
        expect(codes).toContain('specification_supply_quantity');
        expect(codes).not.toContain('specification_distributive');
        expect(codes).not.toContain('specification_service_period');
        expect(codes).not.toContain('lic_long');
        expect(codes).not.toContain('specification_key_period');
    });
});
