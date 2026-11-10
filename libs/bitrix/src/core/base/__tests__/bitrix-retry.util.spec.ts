import {
    attemptAlertNote,
    BITRIX_RETRY_KIND,
    bitrixRetryKind,
} from '../bitrix-retry.util';

const http = (status: number) => ({ response: { status }, message: 'x' });

describe('bitrixRetryKind — какой сбой лечится повтором', () => {
    it.each([500, 502, 503, 504])('HTTP %s — перегрузка облака', status => {
        expect(bitrixRetryKind(http(status))).toBe(BITRIX_RETRY_KIND.transient);
    });

    it.each([400, 401, 403, 404])('HTTP %s — не повторяется', status => {
        expect(bitrixRetryKind(http(status))).toBeNull();
    });

    it('таймаут и обрыв сокета — повторяются', () => {
        expect(
            bitrixRetryKind(
                Object.assign(new Error('timeout of 30000ms exceeded'), {
                    code: 'ECONNABORTED',
                }),
            ),
        ).toBe(BITRIX_RETRY_KIND.timeout);
        expect(
            bitrixRetryKind(
                Object.assign(new Error('socket hang up'), {
                    code: 'ECONNRESET',
                }),
            ),
        ).toBe(BITRIX_RETRY_KIND.connectionReset);
    });

    it('пустая ошибка — не повторяется и не падает', () => {
        expect(bitrixRetryKind(null)).toBeNull();
        expect(bitrixRetryKind(undefined)).toBeNull();
    });
});

/*
 * Решение владельца 10.11.2026: тревога о 500 уходит на каждую попытку, но
 * по тексту видно, будет ли повтор или попытки кончились.
 */
describe('attemptAlertNote — пометка в начале тревоги', () => {
    it('будет повтор — номер попытки и пауза', () => {
        expect(
            attemptAlertNote({
                attempt: 1,
                total: 3,
                retryInMs: 10_000,
                retryable: true,
            }),
        ).toBe('Попытка 1 из 3, повтор через 10 с. ');
    });

    it('повторяемый сбой, попыток не осталось — «попытки исчерпаны»', () => {
        expect(
            attemptAlertNote({
                attempt: 3,
                total: 3,
                retryInMs: null,
                retryable: true,
            }),
        ).toBe('⚠️ ПОПЫТКИ ИСЧЕРПАНЫ (3 из 3) — запрос не выполнен. ');
    });

    it('не повторяемая ошибка (400) — без пометки', () => {
        expect(
            attemptAlertNote({
                attempt: 1,
                total: 2,
                retryInMs: null,
                retryable: false,
            }),
        ).toBe('');
    });
});
