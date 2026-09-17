import { createHash } from 'node:crypto';

/**
 * ВЕРСИЯ СНИМКА — ХЕШ ЗНАЧЕНИЙ, А НЕ ЗАПИСЬ В ХРАНИЛИЩЕ.
 *
 * Решение владельца 17.09.2026: отдельного журнала и зеркала в Redis не
 * заводим. Версия считается из тех же полей, которые видел человек, поэтому
 * её не нужно нигде хранить: робот, крон или соседняя вкладка изменили
 * состояние — хеш перестал совпадать, и ручка выбора отвечает 409.
 */

export interface IInnVersionInput {
    /** Текущий `op_inn` сделки. */
    current: string;
    /** `op_inn_pool` сделки. */
    pool: readonly string[];
    /** Значения, скрытые человеком. */
    hidden: readonly string[];
    /** Все показанные кандидаты (реквизиты и лиды тоже меняют картину). */
    candidates: readonly string[];
    /** Компания сделки: смена клиента меняет весь набор вариантов. */
    companyId: number;
    /** Привязанный реквизит — ведущий источник. */
    requisiteId: number;
}

/** Стабильный короткий хеш состояния ИНН сделки. */
export function innSnapshotVersion(input: IInnVersionInput): string {
    const parts = [
        input.current,
        [...input.pool].sort().join(','),
        [...input.hidden].sort().join(','),
        [...input.candidates].sort().join(','),
        String(input.companyId),
        String(input.requisiteId),
    ];
    return createHash('sha1')
        .update(parts.join('|'))
        .digest('hex')
        .slice(0, 12);
}
