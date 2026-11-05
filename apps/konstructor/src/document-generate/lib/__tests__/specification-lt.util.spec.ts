import { SPECIFICATION_CODE_PATTERN } from '../../dto/specification/specification.dto';
import {
    isLtSpecificationCode,
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
});
