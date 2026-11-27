/**
 * Ошибка чтения картинок поставщика одной строкой для лога: переносы в тексте
 * ошибки Prisma лог не ломают. Нет таблицы `provider_images` (код выложен
 * раньше миграции) называется прямо.
 */
export const readErrorText = (error: unknown): string => {
    const code =
        typeof error === 'object' && error !== null && 'code' in error
            ? error.code
            : null;
    if (code === 'P2021') return 'нет таблицы provider_images';
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/\s+/g, ' ').trim().slice(0, 300);
};
