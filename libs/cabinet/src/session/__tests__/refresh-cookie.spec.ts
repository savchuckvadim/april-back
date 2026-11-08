import { readCookie } from '../refresh-cookie';
import { parsePortalParam } from '../../access/cabinet-access.guard';
import { BadRequestException } from '@nestjs/common';

describe('readCookie (refresh-cookie без cookie-parser)', () => {
    it('находит cookie среди прочих, декодирует значение', () => {
        expect(
            readCookie(
                'a=1; april_cabinet_refresh=ab%2Bcd; b=2',
                'april_cabinet_refresh',
            ),
        ).toBe('ab+cd');
    });

    it('нет заголовка, нет cookie, пустое значение — null', () => {
        expect(readCookie(undefined, 'x')).toBeNull();
        expect(readCookie('a=1', 'x')).toBeNull();
        expect(readCookie('x=', 'x')).toBeNull();
    });

    it('похожее имя не путается', () => {
        expect(readCookie('xx=1; x=2', 'x')).toBe('2');
    });
});

describe('parsePortalParam (:portalId маршрута)', () => {
    it('число → bigint, нет параметра → undefined', () => {
        expect(parsePortalParam('12')).toBe(BigInt(12));
        expect(parsePortalParam(undefined)).toBeUndefined();
    });

    it('мусор и ноль — 400', () => {
        expect(() => parsePortalParam('abc')).toThrow(BadRequestException);
        expect(() => parsePortalParam('0')).toThrow(BadRequestException);
        expect(() => parsePortalParam('1; drop')).toThrow(BadRequestException);
    });
});
