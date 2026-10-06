import {
    isBitrixQueryLimitExceeded,
    isBitrixTimeout,
    readBitrixTime,
} from '../bitrix-response.util';

describe('разбор ответов Битрикса', () => {
    describe('isBitrixTimeout', () => {
        it.each(['ECONNABORTED', 'ETIMEDOUT'])('код %s — таймаут', code => {
            expect(isBitrixTimeout({ code })).toBe(true);
        });

        it('сообщение axios про timeout — таймаут', () => {
            expect(
                isBitrixTimeout({ message: 'timeout of 20000ms exceeded' }),
            ).toBe(true);
        });

        it('прочие ошибки и пустые значения — не таймаут', () => {
            expect(isBitrixTimeout({ code: 'ECONNRESET' })).toBe(false);
            expect(isBitrixTimeout(null)).toBe(false);
            expect(isBitrixTimeout(undefined)).toBe(false);
        });
    });

    describe('isBitrixQueryLimitExceeded', () => {
        it('JSON-ответ с кодом лимита', () => {
            expect(
                isBitrixQueryLimitExceeded({
                    response: { data: { error: 'QUERY_LIMIT_EXCEEDED' } },
                }),
            ).toBe(true);
        });

        it('строковый ответ с кодом лимита', () => {
            expect(
                isBitrixQueryLimitExceeded({
                    response: { data: '{"error":"QUERY_LIMIT_EXCEEDED"}' },
                }),
            ).toBe(true);
        });

        it('другая ошибка или ответа нет — не лимит', () => {
            expect(
                isBitrixQueryLimitExceeded({
                    response: { data: { error: 'ACCESS_DENIED' } },
                }),
            ).toBe(false);
            expect(isBitrixQueryLimitExceeded({})).toBe(false);
        });
    });

    describe('readBitrixTime', () => {
        it('читает processing и operating, округляя до сотых', () => {
            const body = { time: { processing: 3.14159, operating: 12.345 } };
            expect(readBitrixTime(body, 'processing')).toBe(3.14);
            expect(readBitrixTime(body, 'operating')).toBe(12.35);
        });

        it('нет поля, ноль, не число, нет тела — null', () => {
            expect(readBitrixTime({ time: {} }, 'processing')).toBeNull();
            expect(
                readBitrixTime({ time: { operating: 0 } }, 'operating'),
            ).toBeNull();
            expect(
                readBitrixTime({ time: { processing: 'n/a' } }, 'processing'),
            ).toBeNull();
            expect(readBitrixTime('ok', 'processing')).toBeNull();
            expect(readBitrixTime(null, 'operating')).toBeNull();
        });
    });
});
