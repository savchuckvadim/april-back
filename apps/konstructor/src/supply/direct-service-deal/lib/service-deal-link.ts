import { IBXDeal } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Код поля сделки, которым сервисная сделка связывается с базовой сделкой
 * отдела продаж.
 *
 * `to_sale_deal` («Связанная продажа») — единственное поле в канонах pbx,
 * которое стоит на сделке и хранит ССЫЛКУ НА СДЕЛКУ
 * (libs/portal-lib/pbx/domain/src/field/type/sales/event/pbx-sales-event-field.type.ts,
 * строка 1797). Отдельного «базовая сделка поставки» в канонах нет, заводить
 * новое поле — отдельная работа по установщику портала.
 *
 * Связь пишется мягко: нет поля на портале — просто не пишем, создание сделки
 * из-за этого не падает, а поиск существующей сделки откатывается на поиск по
 * компании.
 */
export const SERVICE_DEAL_BASE_DEAL_FIELD_CODE = 'to_sale_deal';

/**
 * Значения поля-связи для записи в сервисную сделку.
 * Пустой объект — поля нет на портале.
 */
export const buildBaseDealLinkValues = (
    portalModel: Pick<PortalModel, 'getDealFieldBitrixIdByCode'>,
    baseDealId: number,
): Partial<IBXDeal> => {
    const bitrixId = portalModel.getDealFieldBitrixIdByCode(
        SERVICE_DEAL_BASE_DEAL_FIELD_CODE,
    );
    if (!bitrixId) {
        return {};
    }

    return { [bitrixId]: buildBaseDealLinkValue(baseDealId) };
};

/**
 * Значение crm-поля со ссылкой на сделку.
 *
 * Битрикс хранит такие поля с префиксом сущности (`D_159701`), когда поле
 * допускает несколько типов сущностей, и голым id — когда только сделки.
 * Пишем в префиксной форме: её принимают оба варианта настройки.
 */
export const buildBaseDealLinkValue = (baseDealId: number): string =>
    `D_${baseDealId}`;

/**
 * Обе формы значения — для фильтра поиска: не знаем, как поле настроено на
 * конкретном портале, поэтому ищем и по `D_159701`, и по `159701`.
 */
export const buildBaseDealLinkFilterValues = (baseDealId: number): string[] => [
    buildBaseDealLinkValue(baseDealId),
    String(baseDealId),
];
