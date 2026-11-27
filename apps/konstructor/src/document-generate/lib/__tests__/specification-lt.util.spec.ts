import { SPECIFICATION_CODE_PATTERN } from '../../dto/specification/specification.dto';
import {
    buildLtSpecificationRows,
    isLtPaidSpecificationCode,
    isLtSpecificationCode,
    LT_PAID_FALLBACK_NAME,
    ltPaidPacketCode,
    ltPaidServicesCode,
    readLtPaidPackets,
} from '../specification-lt.util';

describe('строки платных пакетов Legal Tech', () => {
    it('коды: первый пакет — легаси, дальше с номером; валидатор их пропускает', () => {
        expect(ltPaidPacketCode(0)).toBe('specification_lt_packet');
        expect(ltPaidServicesCode(0)).toBe('specification_lt_services');
        expect(ltPaidPacketCode(2)).toBe('specification_lt_packet_3');
        expect(ltPaidServicesCode(1)).toBe('specification_lt_services_2');

        expect(SPECIFICATION_CODE_PATTERN.test('specification_lt_packet_12')).toBe(true);
        expect(SPECIFICATION_CODE_PATTERN.test('complect_name')).toBe(true);
        expect(SPECIFICATION_CODE_PATTERN.test('specification_lt_free_2')).toBe(false);
        expect(SPECIFICATION_CODE_PATTERN.test('specification_iblocks_x')).toBe(false);
        expect(isLtSpecificationCode('specification_lt_services_2')).toBe(true);
        expect(isLtSpecificationCode('specification_services')).toBe(false);
    });

    it('readLtPaidPackets: по порядку номеров, состав списком, пустой легаси-пакет пропущен', () => {
        const packets = readLtPaidPackets([
            { code: 'specification_lt_free', value: 'LT Малый' },
            { code: 'specification_lt_packet', value: '' },
            { code: 'specification_lt_services', value: '' },
            { code: 'specification_lt_packet_2', value: ' LT Средний ' },
            { code: 'specification_lt_services_2', value: 'ЧекДок\n\n Тендер \n' },
            { code: 'specification_lt_packet_3', value: 'LT Большой' },
        ]);
        expect(packets).toEqual([
            { name: 'LT Средний', services: ['ЧекДок', 'Тендер'] },
            { name: 'LT Большой', services: [] },
        ]);
        expect(readLtPaidPackets([])).toEqual([]);
    });

    it('платный пакет с составом и без названия печатается под названием по умолчанию', () => {
        expect(
            readLtPaidPackets([
                { code: 'specification_lt_packet', value: '  ' },
                { code: 'specification_lt_services', value: 'ЧекДок\nТендер' },
            ]),
        ).toEqual([
            { name: LT_PAID_FALLBACK_NAME, services: ['ЧекДок', 'Тендер'] },
        ]);
    });

    it('isLtPaidSpecificationCode: платные пакеты и составы, но не бесплатный LT', () => {
        expect(isLtPaidSpecificationCode('specification_lt_packet')).toBe(true);
        expect(isLtPaidSpecificationCode('specification_lt_packet_2')).toBe(
            true,
        );
        expect(isLtPaidSpecificationCode('specification_lt_services_3')).toBe(
            true,
        );
        expect(isLtPaidSpecificationCode('specification_lt_free')).toBe(false);
        expect(isLtPaidSpecificationCode('specification_lt_free_services')).toBe(
            false,
        );
    });

    it('buildLtSpecificationRows: строки читаются теми же readLtPaidPackets', () => {
        const rows = buildLtSpecificationRows({
            freePacket: 'LT Малый',
            freeServices: ['Сутяжник'],
            paidPackets: [
                { name: 'LT Средний', services: ['ЧекДок', 'Тендер'] },
                { name: 'LT Большой', services: [] },
            ],
        });

        expect(rows).toEqual([
            { code: 'specification_lt_free', value: 'LT Малый' },
            { code: 'specification_lt_free_services', value: 'Сутяжник' },
            { code: 'specification_lt_packet', value: 'LT Средний' },
            { code: 'specification_lt_services', value: 'ЧекДок\nТендер' },
            { code: 'specification_lt_packet_2', value: 'LT Большой' },
            { code: 'specification_lt_services_2', value: '' },
        ]);
        expect(readLtPaidPackets(rows)).toEqual([
            { name: 'LT Средний', services: ['ЧекДок', 'Тендер'] },
            { name: 'LT Большой', services: [] },
        ]);
        // без бесплатного пакета его строк нет
        expect(
            buildLtSpecificationRows({
                freePacket: '',
                freeServices: ['x'],
                paidPackets: [],
            }),
        ).toEqual([]);
    });
});
