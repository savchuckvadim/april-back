import {
    BadRequestException,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import {
    InnDealClosedError,
    InnDealNotFoundError,
    InnHideCurrentError,
    InnInvalidValueError,
    InnNoTargetError,
    InnVersionConflictError,
} from '../inn.errors';
import { runInnAction, toInnHttpError } from '../inn-http.errors';

describe('перевод доменных ошибок ИНН в HTTP', () => {
    it.each([
        ['сделка не найдена', new InnDealNotFoundError(1), NotFoundException],
        [
            'устаревшая версия снимка',
            new InnVersionConflictError('a', 'b'),
            ConflictException,
        ],
        ['сделка закрыта', new InnDealClosedError(1), ConflictException],
        [
            'скрыть текущий ИНН',
            new InnHideCurrentError('7707083893'),
            ConflictException,
        ],
        [
            'значение не ИНН',
            new InnInvalidValueError('123'),
            BadRequestException,
        ],
        ['писать некуда', new InnNoTargetError(), BadRequestException],
    ])('%s', (_label, error, expected) => {
        const mapped = toInnHttpError(error);

        expect(mapped).toBeInstanceOf(expected);
        expect((mapped as Error).message).toBe(error.message);
    });

    it('незнакомая ошибка проходит как есть', () => {
        const error = new Error('сеть упала');

        expect(toInnHttpError(error)).toBe(error);
    });

    it('runInnAction отдаёт результат и бросает переведённую ошибку', async () => {
        await expect(runInnAction(() => Promise.resolve(42))).resolves.toBe(42);
        await expect(
            runInnAction(() => Promise.reject(new InnDealClosedError(7))),
        ).rejects.toBeInstanceOf(ConflictException);
    });
});
