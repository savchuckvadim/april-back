import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from 'generated/prisma';

/**
 * Коды ошибок Prisma, которые значат что-то для статей и медиатеки сайта.
 * Образцы обработки — methodology.prisma.repository.ts и cabinet-guide.service.ts.
 */
export const SITE_CONTENT_PRISMA_ERRORS = {
    /** Таблицы нет — миграция online ещё не применена. */
    tableMissing: 'P2021',
    /** Нарушен уникальный ключ: адрес занят, номер версии уже вставлен. */
    unique: 'P2002',
    /** Нарушен внешний ключ: медиа стоит в статье. */
    foreignKey: 'P2003',
    /** Строки для правки или удаления нет. */
    recordMissing: 'P2025',
} as const;

export type SiteContentPrismaError = keyof typeof SITE_CONTENT_PRISMA_ERRORS;

export const isSiteContentPrismaError = (
    error: unknown,
    kind: SiteContentPrismaError,
): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === SITE_CONTENT_PRISMA_ERRORS[kind];

export const SITE_CONTENT_TABLES_MISSING_MESSAGE =
    'Таблицы статей и медиатеки сайта ещё не созданы: миграция базы не применена. Сообщите владельцу — после миграции раздел заработает без выкладки';

/**
 * Таблиц статей или медиатеки нет. Админке — 503 с понятным текстом;
 * публичное чтение ловит это исключение и отвечает «статьи нет», чтобы
 * сайт показал текст из кода.
 */
export class SiteContentTablesMissingException extends ServiceUnavailableException {
    constructor() {
        super(SITE_CONTENT_TABLES_MISSING_MESSAGE);
    }
}

/** Что отдать вместо ошибки Prisma с данным кодом (кроме «таблицы нет» — она общая). */
export type SiteContentPrismaErrorMap = Partial<
    Record<Exclude<SiteContentPrismaError, 'tableMissing'>, () => Error>
>;

const MAPPED_KINDS = ['unique', 'foreignKey', 'recordMissing'] as const;

/** Ошибка Prisma → понятное исключение; остальные ошибки — как были. */
export function translateSiteContentError(
    error: unknown,
    map: SiteContentPrismaErrorMap = {},
): Error {
    if (isSiteContentPrismaError(error, 'tableMissing')) {
        return new SiteContentTablesMissingException();
    }
    for (const kind of MAPPED_KINDS) {
        const make = map[kind];
        if (make && isSiteContentPrismaError(error, kind)) return make();
    }
    return error instanceof Error ? error : new Error(String(error));
}

/** Запрос к таблицам сайта с переводом ошибок Prisma (см. translateSiteContentError). */
export async function withSiteContentTables<T>(
    work: () => Promise<T>,
    map: SiteContentPrismaErrorMap = {},
): Promise<T> {
    try {
        return await work();
    } catch (error) {
        throw translateSiteContentError(error, map);
    }
}
