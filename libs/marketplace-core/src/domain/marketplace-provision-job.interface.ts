/**
 * Payload задания provisioning pbx-сущностей (очередь MARKETPLACE_PROVISION).
 * Общий контракт продюсера (apps/pbx marketplace) и воркера (apps/pbx-install).
 */

/** Чем инициирован запуск provisioning */
export type MarketplaceProvisionTrigger = 'approve' | 'admin_refresh';

export interface MarketplaceProvisionJobPayload {
    /** Текущий домен портала (для PBXService.init и логов) */
    domain: string;
    /** Постоянный идентификатор портала в Битрикс24 */
    memberId: string;
    /** Код продукта из portal_products (sales | service) */
    productCode: string;
    /** Источник запуска (для журнала/диагностики) */
    trigger: MarketplaceProvisionTrigger;
    /** Сквозной идентификатор запуска для трассировки в логах */
    requestId: string;
}
