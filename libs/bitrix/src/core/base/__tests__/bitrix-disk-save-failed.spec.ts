import {
    bitrixCallMethodOf,
    noteBitrixCallMethod,
} from '../bitrix-error-method.util';
import {
    BITRIX_DISK_SAVE_FAILED,
    isBitrixDiskSaveFailed,
    readBitrixErrorBody,
} from '../bitrix-response.util';
import { BITRIX_RETRY_KIND, bitrixRetryKind } from '../bitrix-retry.util';

/**
 * gsirk 26.11.2026, сделка 281275: `disk.folder.uploadfile` вернул HTTP 400
 * `DISK_FOLDER_22002`, генерация КП упала, повтор через восемь минут прошёл.
 */

const axiosLike = (status: number, data: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, data },
    });

const diskSaveError = (status = 400) =>
    axiosLike(status, {
        error: BITRIX_DISK_SAVE_FAILED,
        error_description: 'Не удалось сохранить файл. (DISK_FOLDER_22002).',
    });

describe('readBitrixErrorBody', () => {
    it('достаёт статус, код и описание из тела ответа', () => {
        expect(readBitrixErrorBody(diskSaveError())).toEqual({
            status: 400,
            code: 'DISK_FOLDER_22002',
            description: 'Не удалось сохранить файл. (DISK_FOLDER_22002).',
        });
    });

    it('ответа не было — всё null', () => {
        expect(readBitrixErrorBody(new Error('socket hang up'))).toEqual({
            status: null,
            code: null,
            description: null,
        });
    });

    it('тело не JSON (страница прокси) — статус есть, кода и описания нет', () => {
        expect(
            readBitrixErrorBody(axiosLike(502, '<html>Bad Gateway</html>')),
        ).toEqual({ status: 502, code: null, description: null });
    });

    it('пустые и нестроковые поля — null', () => {
        expect(
            readBitrixErrorBody(
                axiosLike(400, { error: '  ', error_description: 5 }),
            ),
        ).toEqual({ status: 400, code: null, description: null });
    });

    it('пустая ошибка не роняет разбор', () => {
        expect(readBitrixErrorBody(null).status).toBeNull();
        expect(readBitrixErrorBody(undefined).code).toBeNull();
    });
});

describe('isBitrixDiskSaveFailed и повтор', () => {
    it('HTTP 400 с кодом DISK_FOLDER_22002 — отказ Диска, лечится повтором', () => {
        expect(isBitrixDiskSaveFailed(diskSaveError())).toBe(true);
        expect(bitrixRetryKind(diskSaveError())).toBe(
            BITRIX_RETRY_KIND.diskSave,
        );
    });

    it('другой 400 — не повторяется', () => {
        const other = axiosLike(400, {
            error: 'DISK_FOLDER_22003',
            error_description: 'Папка не найдена',
        });
        expect(isBitrixDiskSaveFailed(other)).toBe(false);
        expect(bitrixRetryKind(other)).toBeNull();
        expect(
            bitrixRetryKind(axiosLike(400, { error: 'ERROR_CORE' })),
        ).toBeNull();
    });

    it('тот же код не при 400 — этот признак не срабатывает', () => {
        expect(isBitrixDiskSaveFailed(diskSaveError(403))).toBe(false);
        expect(bitrixRetryKind(diskSaveError(403))).toBeNull();
    });
});

describe('метка метода Битрикса на ошибке', () => {
    it('метод запоминается рядом с ошибкой и не меняет её поля', () => {
        const error = diskSaveError();
        const before = JSON.stringify(Object.keys(error));

        noteBitrixCallMethod(error, 'disk.folder.uploadfile');

        expect(bitrixCallMethodOf(error)).toBe('disk.folder.uploadfile');
        expect(JSON.stringify(Object.keys(error))).toBe(before);
    });

    it('ошибка без метки и не-объекты — null', () => {
        expect(bitrixCallMethodOf(new Error('x'))).toBeNull();
        expect(bitrixCallMethodOf('boom')).toBeNull();
        expect(bitrixCallMethodOf(null)).toBeNull();
        expect(() =>
            noteBitrixCallMethod('boom', 'crm.deal.get'),
        ).not.toThrow();
    });
});
