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
} from './inn.errors';

/**
 * Перевод доменных ошибок ИНН в коды ответа: 404, 409, 400.
 *
 * Сами доменные ошибки про HTTP не знают (`inn.errors.ts`). Перевод лежит
 * здесь, одним местом на все приложения с ручками ИНН (event-sales,
 * konstructor): фронты обрабатывают 400 и 409 одинаково, и коды не должны
 * расходиться от приложения к приложению.
 *
 * Незнакомая ошибка проходит как есть: её обработает глобальный фильтр.
 */
export function toInnHttpError(error: unknown): unknown {
    if (error instanceof InnDealNotFoundError) {
        return new NotFoundException(error.message);
    }
    if (
        error instanceof InnVersionConflictError ||
        error instanceof InnDealClosedError ||
        error instanceof InnHideCurrentError
    ) {
        return new ConflictException(error.message);
    }
    if (
        error instanceof InnInvalidValueError ||
        error instanceof InnNoTargetError
    ) {
        return new BadRequestException(error.message);
    }
    return error;
}

/** Выполнить действие, превратив доменные ошибки ИНН в HTTP-исключения. */
export async function runInnAction<T>(action: () => Promise<T>): Promise<T> {
    try {
        return await action();
    } catch (error) {
        throw toInnHttpError(error);
    }
}
