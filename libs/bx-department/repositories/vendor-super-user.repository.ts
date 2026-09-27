/**
 * Порт доступа к суперпользователям вендора (сотрудникам April).
 *
 * Абстрактный класс, а не интерфейс: Nest DI подменяет реализацию по токену,
 * а токеном может быть только значение времени выполнения.
 */

/** Запись о суперпользователе April на портале клиента. */
export interface VendorSuperUserRecord {
    id: string;
    portalId: number;
    domain: string;
    /** Bitrix-id сотрудника April на этом портале. */
    bitrixId: number;
    /** Кто это — для людей в админке. */
    comment: string | null;
    isActive: boolean;
}

/** Что можно создать или изменить из админки. */
export interface VendorSuperUserInput {
    bitrixId: number;
    comment?: string | null;
    isActive?: boolean;
}

export abstract class VendorSuperUserRepository {
    /**
     * АКТИВНЫЕ Bitrix-id для домена — горячий путь проверки прав.
     * Неактивные записи не возвращаются: снятый доступ должен исчезать
     * сразу, а не фильтроваться вызывающим.
     */
    abstract findActiveBitrixIdsByDomain(domain: string): Promise<number[]>;

    /** Все записи портала для экрана админки, включая снятые с доступа. */
    abstract findByPortalId(portalId: number): Promise<VendorSuperUserRecord[]>;

    /**
     * Создать или обновить по паре (портал, bitrixId) — та же уникальность,
     * что в БД, поэтому повторное добавление того же сотрудника не падает,
     * а обновляет комментарий и признак активности.
     */
    abstract upsert(
        portalId: number,
        input: VendorSuperUserInput,
    ): Promise<VendorSuperUserRecord>;

    /**
     * Удалить запись портала. Возвращает домен удалённой записи — по нему
     * вызывающий сбрасывает кэш; null, если записи уже не было.
     *
     * Именно домен, а не boolean: после удаления ПОСЛЕДНЕЙ записи портала
     * взять домен из остатка списка неоткуда, и снятый доступ доживал бы TTL.
     */
    abstract remove(portalId: number, bitrixId: number): Promise<string | null>;
}
