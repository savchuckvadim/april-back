/**
 * Формат значения crm-поля смарта при ЗАПИСИ (`crm.item.add/update`).
 *
 * Битрикс ждёт РАЗНОЕ в зависимости от настроек поля, и это была причина
 * бага: элементы ЗПР создавались с пустыми «Основная сделка», «Компания»,
 * «Лид/заявка», потому что во все эти поля уезжало `['D_25359']`.
 *
 * Правила:
 *  - поле привязано к ОДНОЙ сущности (`crmEntities: ['DEAL']`) — значение
 *    это ГОЛЫЙ id (`25359`). Тип сущности уже задан настройкой поля, и
 *    префикс `D_` для Битрикса мусор: значение не сохраняется молча;
 *  - поле привязано к НЕСКОЛЬКИМ сущностям — значение с префиксом
 *    (`D_25359`), иначе неизвестно, к какой сущности относится id. Ровно
 *    так хранит мультитипный `to_base_sales` лида;
 *  - `isMultiple` — значение оборачивается в массив, иначе скаляр.
 *
 * Чтение терпит ОБА формата (см. `hasLink` потоков): исторические элементы
 * писались префиксом, и ломать их поиск нельзя.
 */

/** Минимум описания поля, нужный для выбора формата. */
export interface CrmLinkFieldShape {
    readonly crmEntities?: readonly string[];
    readonly isMultiple?: boolean;
}

/** Префикс сущности в мультитипной привязке. */
export type CrmLinkPrefix = 'D' | 'L' | 'CO' | 'C';

/**
 * Значение crm-поля для записи; `null` — id невалиден, поле писать не надо.
 *
 * `field` не найден в реестре (код разъехался с константой) — считаем поле
 * мультитипным: префиксная форма читается обеими ветками `hasLink`, то есть
 * в худшем случае значение сохранится в менее удобном виде, а не потеряется.
 */
export function buildCrmLinkValue(
    field: CrmLinkFieldShape | undefined,
    prefix: CrmLinkPrefix,
    id: number | string,
): unknown {
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) return null;

    const isSingleEntity = field?.crmEntities?.length === 1;
    const value = isSingleEntity ? numericId : `${prefix}_${numericId}`;
    return field?.isMultiple ? [value] : value;
}

/**
 * Читающий близнец {@link buildCrmLinkValue}: содержит ли значение crm-поля
 * ссылку на сущность. Терпит ВСЕ фактические формы хранения — `D_100`
 * (мультитипная привязка), голые `100`/100 (одиночно-типизированное поле;
 * именно так пишет buildCrmLinkValue и так же Битрикс сам нормализует
 * значения), массив и скаляр. Исторические элементы писались префиксом,
 * новые — голым id, и искаться обязаны оба поколения.
 */
export function hasCrmLink(
    raw: unknown,
    prefix: CrmLinkPrefix,
    id: number | string,
): boolean {
    const expected = new Set([`${prefix}_${id}`, String(id)]);
    const values = Array.isArray(raw) ? raw : [raw];
    return values.some(value => expected.has(String(value ?? '')));
}
