/**
 * Ожидаемые «ошибки» Bitrix REST, которые вызывающий код обрабатывает сам:
 * в лог — предупреждение, в Telegram — ничего. Чистая функция, чтобы
 * правило было проверяемо без сети и без сборки BitrixCore.
 *
 * - ACTIVITY_IS_ALREADY_BOUND — идемпотентный повтор привязки дела,
 *   трактуется как успех;
 * - Row size too large — штатная ступень бюджетной записи смарта
 *   (CallReportSmartWriterService деградирует состав полей и сам алертит
 *   ТОЛЬКО финальный отказ; 12.08.2026 промежуточные попытки заспамили
 *   админ-чат восемью алертами за минуту);
 * - Not found у crm.{deal,lead,contact,company}.get — сущность удалена или
 *   недоступна; разбор звонков читает семью сделок, корневую сделку, лид и
 *   контакт по ссылкам из карточек и списков, и каждый читатель штатно
 *   принимает «нет» (14.09.2026: четырнадцать одинаковых алертов за день на
 *   одну удалённую сделку).
 */

export const BITRIX_BENIGN_MARKERS = [
    'ACTIVITY_IS_ALREADY_BOUND',
    'Row size too large',
] as const;

/** Методы чтения одной CRM-сущности по id. */
const CRM_ENTITY_GET_METHOD = /^crm\.(deal|lead|contact|company)\.get$/;

const NOT_FOUND_TEXT = /not found/i;

export const BITRIX_NOT_FOUND_MARKER = 'Not found';

/**
 * Маркер ожидаемой ошибки либо null, если ошибка настоящая и заслуживает
 * алерта.
 *
 * @param method REST-метод, например `crm.deal.get`
 * @param responseJson тело ответа Bitrix, сериализованное в строку
 */
export function benignBitrixErrorMarker(
    method: string,
    responseJson: string,
): string | null {
    const marker = BITRIX_BENIGN_MARKERS.find(text =>
        responseJson.includes(text),
    );
    if (marker) return marker;
    if (
        CRM_ENTITY_GET_METHOD.test(method) &&
        NOT_FOUND_TEXT.test(responseJson)
    ) {
        return BITRIX_NOT_FOUND_MARKER;
    }
    return null;
}

/**
 * id запрошенной сущности из параметров вызова — для читаемого лога.
 * Принимает `unknown`: тело запроса приходит из нетипизированного слоя REST.
 */
export function requestedEntityId(data: unknown): string {
    if (typeof data !== 'object' || data === null) return '—';
    const params = data as Record<string, unknown>;
    const id = params.id ?? params.ID;
    return typeof id === 'number' || typeof id === 'string' ? String(id) : '—';
}
