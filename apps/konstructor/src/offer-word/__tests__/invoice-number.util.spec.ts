import { formatInvoiceNumber } from '../lib/invoice-number.util';

describe('formatInvoiceNumber', () => {
    it('первый счёт получает введённый номер как есть', () => {
        expect(formatInvoiceNumber('15', 0)).toBe('15');
    });

    it('следующие счета получают суффиксы -1, -2…', () => {
        expect(formatInvoiceNumber('15', 1)).toBe('15-1');
        expect(formatInvoiceNumber('15', 2)).toBe('15-2');
        expect(formatInvoiceNumber('КП-1042', 3)).toBe('КП-1042-3');
    });

    it('пустой номер остаётся пустым без суффикса', () => {
        expect(formatInvoiceNumber('', 0)).toBe('');
        expect(formatInvoiceNumber('', 2)).toBe('');
        expect(formatInvoiceNumber(undefined, 1)).toBe('');
        expect(formatInvoiceNumber(null, 1)).toBe('');
        expect(formatInvoiceNumber('   ', 1)).toBe('   ');
    });

    it('отрицательный порядок не даёт суффикса', () => {
        expect(formatInvoiceNumber('15', -1)).toBe('15');
    });
});
