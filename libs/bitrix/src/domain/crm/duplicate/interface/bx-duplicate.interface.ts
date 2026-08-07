/**
 * Типы crm.duplicate.findbycomm — штатный поиск лидов/контактов/компаний
 * по телефону или email. Сделки метод не ищет.
 */

export type BxFindByCommType = 'PHONE' | 'EMAIL';

/** Сущности, в которых умеет искать findbycomm. */
export type BxFindByCommEntityType = 'LEAD' | 'CONTACT' | 'COMPANY';

export interface IBXFindByCommRequest {
    /** Вид коммуникации. */
    type: BxFindByCommType;
    /** Значения для поиска; метод принимает не больше 20 за вызов. */
    values: string[];
    /** Сузить поиск до одного типа сущности; без него ищет во всех трёх. */
    entity_type?: BxFindByCommEntityType;
}

/**
 * Ответ: идентификаторы найденных сущностей по типам. Ключи присутствуют
 * только при наличии совпадений; метод НЕ сообщает, какое именно из
 * отправленных значений совпало.
 */
export interface IBXFindByCommResult {
    LEAD?: number[];
    CONTACT?: number[];
    COMPANY?: number[];
}
