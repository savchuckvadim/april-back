import { BitrixService } from '@lib/bitrix';

/**
 * Кто из сотрудников работает прямо сейчас: аккаунт активен и сотрудник
 * не в отделе неработающих. Живёт в приложении (event-sales:
 * `ActiveStaffService` — структурно уже подходит), библиотеке нужен
 * только этот вопрос. Инстанс Битрикса — параметр: адаптер не хранит его
 * в поле (CLAUDE.md).
 */
export interface RopStaffPort {
    /** Подмножество `ids`, кто работает. */
    activeUserIds(
        domain: string,
        bitrix: BitrixService,
        ids: number[],
    ): Promise<Set<number>>;
}
