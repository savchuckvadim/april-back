import { BxRqDto } from '../../dto/bx-rq/bx-rq.dto';
import { ClientTypeEnum } from '../../type/client.type';
import { BX_ADDRESS_TYPE } from '../../type/bx-rq.type';
import { BLANK, BLANK_WIDE, blank, DocumentClientBxRqService } from '../bx-client-rq.service';

const field = (code: string, value: unknown) => ({ code, value });

const rq = (overrides: Partial<BxRqDto> = {}): BxRqDto =>
    ({
        preset_id: 2,
        fields: [],
        address: { items: [] },
        bank: { items: [], current: { id: -1, fields: [] } },
        ...overrides,
    }) as unknown as BxRqDto;

describe('DocumentClientBxRqService.getClientRq', () => {
    const service = new DocumentClientBxRqService();

    it('организация без реквизита: все строки с прочерками, без «undefined»', () => {
        const lines = service.getClientRq(undefined, ClientTypeEnum.ORG);

        expect(lines).toEqual([
            BLANK_WIDE,
            `Адрес: ${BLANK_WIDE}`,
            `Телефон: ${BLANK}`,
            `ИНН: ${BLANK}`,
            `Банк: ${BLANK_WIDE}`,
            `Р/с: ${BLANK}`,
            `К/с: ${BLANK}`,
            `БИК: ${BLANK}`,
        ]);
        expect(lines.join('\n')).not.toContain('undefined');
    });

    it('организация: название, юридический адрес по type_id, телефон, ИНН, банк', () => {
        const lines = service.getClientRq(
            rq({
                fields: [
                    field('fullname', 'ООО «Ромашка»'),
                    field('inn', '7701234567'),
                    field('phone', '+7 495 000-00-00'),
                ],
                address: {
                    items: [
                        {
                            anchor_id: 353,
                            type_id: BX_ADDRESS_TYPE.PRIMARY,
                            name_type: 'Фактический адрес',
                            fields: [field('address_city', 'Тула')],
                        },
                        {
                            anchor_id: 353,
                            type_id: BX_ADDRESS_TYPE.REGISTERED,
                            name_type: 'Юридический адрес',
                            fields: [
                                field('address_postal_code', '101000'),
                                field('address_country', ''),
                                field('address_city', 'Москва'),
                                field('address_1', 'ул. Ленина, 1'),
                            ],
                        },
                    ],
                },
                bank: {
                    items: [],
                    current: {
                        id: 5,
                        fields: [
                            field('bank_name', 'Сбербанк'),
                            field('bank_pc', '40702810'),
                            field('bank_kc', ''),
                            field('bank_bik', '044525225'),
                            field('comments', 'Прочие сведения'),
                        ],
                    },
                },
            } as unknown as Partial<BxRqDto>),
            ClientTypeEnum.ORG,
        );

        expect(lines).toEqual([
            'ООО «Ромашка»',
            'Адрес: 101000, Москва, ул. Ленина, 1',
            'Телефон: +7 495 000-00-00',
            'ИНН: 7701234567',
            'Банк: Сбербанк',
            'Р/с: 40702810',
            `К/с: ${BLANK}`,
            'БИК: 044525225',
            'Прочие сведения',
        ]);
    });

    it('физлицо: ФИО, документ с датой и кем выдан, ИНН, адрес, телефон, банк', () => {
        const lines = service.getClientRq(
            rq({
                fields: [
                    field('personName', 'Иванов Иван Иванович'),
                    field('document', 'Паспорт'),
                    field('docSer', '45 05'),
                    field('docNum', '123456'),
                    field('docDate', '01.02.2010'),
                    field('issued_by', 'ОВД Тверское'),
                ],
            } as unknown as Partial<BxRqDto>),
            ClientTypeEnum.FIZ,
        );

        expect(lines.slice(0, 6)).toEqual([
            'Иванов Иван Иванович',
            'Документ: Паспорт',
            'Серия: 45 05',
            'Номер: 123456',
            'Документ выдан: 01.02.2010, ОВД Тверское',
            `Код подразделения: ${BLANK}`,
        ]);
        expect(lines[6]).toBe(`ИНН: ${BLANK}`);
        expect(lines[7]).toBe(`Адрес: ${BLANK_WIDE}`);
    });

    it('адрес — только юридический (у физлица это прописка): фактический вместо него не подставляется', () => {
        const lines = service.getClientRq(
            rq({
                address: {
                    items: [
                        {
                            anchor_id: 353,
                            type_id: BX_ADDRESS_TYPE.PRIMARY,
                            name_type: 'Фактический адрес',
                            fields: [field('address_city', 'Тула')],
                        },
                    ],
                },
            } as unknown as Partial<BxRqDto>),
            ClientTypeEnum.FIZ,
        );
        expect(lines).toContain(`Адрес: ${BLANK_WIDE}`);
        expect(lines.join(' ')).not.toContain('Тула');
    });

    it('blank: пробелы и объекты считаются пустыми', () => {
        expect(blank('  ')).toBe(BLANK);
        expect(blank({ id: 1 })).toBe(BLANK);
        expect(blank(42)).toBe('42');
        expect(blank(' ООО ', BLANK_WIDE)).toBe('ООО');
    });
});
