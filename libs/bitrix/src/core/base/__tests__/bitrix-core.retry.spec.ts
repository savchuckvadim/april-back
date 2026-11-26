import { BitrixCore, TRANSIENT_BITRIX_STATUSES } from '../bitrix-core.service';
import { BITRIX_REQUEST_PROFILES } from '../bitrix-request-profile';
import { BITRIX_CALL_CLASS } from '../../context/bitrix-call-context';

/**
 * Какие ошибки Битрикса повторяем. Метод защищённый — зовём через
 * прототип с минимальным `this` (нужен только logger).
 */
const profile = BITRIX_REQUEST_PROFILES[BITRIX_CALL_CLASS.interactive];
const warn = jest.fn();
const pause = (error: unknown, retriesLeft = 1): number | null =>
    (
        BitrixCore.prototype as unknown as {
            resolveRetryPause: (
                e: unknown,
                m: string,
                r: number,
                p: typeof profile,
            ) => number | null;
        }
    ).resolveRetryPause.call(
        { logger: { warn } },
        error,
        'crm.item.list',
        retriesLeft,
        profile,
    ) as number | null;

const http = (status: number) => ({ response: { status }, message: 'x' });

describe('BitrixCore — повтор запроса', () => {
    beforeEach(() => warn.mockClear());

    // garantservisvoronezh 09.11.2026 10:00:05: один 500 на crm.item.list
    // уронил окно холодного обзвона на 85 сделок — повторять обязаны.
    it.each([500, 502, 503, 504])(
        'HTTP %s — повтор с паузой «портал занят»',
        status => {
            expect(pause(http(status))).toBe(profile.busyPauseMs);
            expect(warn).toHaveBeenCalledTimes(1);
        },
    );

    it.each([400, 401, 403, 404])('HTTP %s — не повторяем', status => {
        expect(pause(http(status))).toBeNull();
    });

    it('попытки кончились — не повторяем даже 500', () => {
        expect(pause(http(500), 0)).toBeNull();
    });

    // gsirk 26.11.2026: Диск отказал в сохранении файла, повтор прошёл.
    it('400 с кодом DISK_FOLDER_22002 — временный отказ Диска, повтор с паузой «портал занят»', () => {
        const diskBusy = {
            message: 'Request failed with status code 400',
            response: {
                status: 400,
                data: {
                    error: 'DISK_FOLDER_22002',
                    error_description: 'Не удалось сохранить файл.',
                },
            },
        };

        expect(pause(diskBusy)).toBe(profile.busyPauseMs);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(pause(diskBusy, 0)).toBeNull();
    });

    it('другие 400 с телом ошибки Битрикса — не повторяем', () => {
        for (const error of [
            'ERROR_CORE',
            'DISK_FOLDER_22003',
            'BAD_REQUEST',
        ]) {
            expect(
                pause({
                    message: 'x',
                    response: { status: 400, data: { error } },
                }),
            ).toBeNull();
        }
    });

    // gsr 02.11.2026: сброшенный keep-alive сокет ронял пачку целиком.
    it('обрыв соединения («socket hang up», ECONNRESET) — короткая пауза и повтор', () => {
        expect(pause(new Error('socket hang up'))).toBe(
            profile.connectionResetPauseMs,
        );
        expect(
            pause(
                Object.assign(new Error('read ECONNRESET'), {
                    code: 'ECONNRESET',
                }),
            ),
        ).toBe(profile.connectionResetPauseMs);
    });

    it('прочая сетевая ошибка без HTTP-ответа — не повторяем', () => {
        expect(pause(new Error('getaddrinfo ENOTFOUND'))).toBeNull();
    });

    it('набор временных статусов — ровно серверные 5xx облака', () => {
        expect([...TRANSIENT_BITRIX_STATUSES].sort()).toEqual([
            500, 502, 503, 504,
        ]);
    });
});
