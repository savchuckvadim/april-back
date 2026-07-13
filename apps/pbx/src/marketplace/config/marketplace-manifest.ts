/**
 * Манифест маркетплейс-приложения «Менеджер Гарант».
 *
 * Состав продуктов (плейсменты, сценарии, компоненты) — КОД, а не БД:
 * он одинаков для всех порталов и версионируется вместе с приложением.
 * В БД хранятся только факты: доступ (portal_products) и статусы
 * установки (marketplace_install_components).
 *
 * ⚠️ Коды и названия плейсментов — ЧЕРНОВИК (уточняются владельцем,
 * см. ai/marketplace/APP_PUBLICATION_DATA.md, раздел 3): места встройки
 * заявляются в карточке решения и должны совпадать с манифестом.
 */

export enum MarketplaceProduct {
    SALES = 'sales',
    SERVICE = 'service',
}

/** Компоненты установки (component_type в marketplace_install_components) */
export enum MarketplaceComponentType {
    PLACEMENT = 'placement',
    SMART_SCENARIO = 'smart_scenario',
    PBX_ENTITIES = 'pbx_entities',
}

/** События жизненного цикла, регистрируемые при установке через event.bind */
export const MARKETPLACE_LIFECYCLE_EVENTS = [
    'ONAPPUNINSTALL',
    'ONAPPUPDATE',
    'ONAPPPAYMENT',
] as const;
export type MarketplaceLifecycleEvent =
    (typeof MARKETPLACE_LIFECYCLE_EVENTS)[number];

export interface PlacementManifestItem {
    /** Продукт, которому принадлежит виджет */
    product: MarketplaceProduct;
    /** Место встройки Битрикс24 (PLACEMENT) */
    placement: string;
    /** Наш код виджета — станет частью HANDLER-URL и component_code */
    code: string;
    /** Название вкладки/виджета в интерфейсе Битрикс24 */
    title: string;
    description?: string;
}

/** Плейсменты продукта sales — биндятся при установке приложения */
export const SALES_PLACEMENTS: PlacementManifestItem[] = [
    {
        product: MarketplaceProduct.SALES,
        placement: 'CRM_DEAL_DETAIL_TAB',
        code: 'event-sales',
        title: 'Гарант: Звонки',
        description: 'Виджет звонков и событий по сделке',
    },
    {
        product: MarketplaceProduct.SALES,
        placement: 'CRM_DEAL_DETAIL_TAB',
        code: 'konstructor',
        title: 'Гарант: Конструктор КП',
        description: 'Конструктор коммерческих предложений',
    },
    {
        product: MarketplaceProduct.SALES,
        placement: 'CRM_COMPANY_DETAIL_TAB',
        code: 'report-sales',
        title: 'Гарант: Отчёты',
        description: 'Отчёты отдела продаж',
    },
];

export interface SmartScenarioManifestItem {
    product: MarketplaceProduct;
    /** Наш код сценария (component_code) */
    code: string;
    title: string;
}

/**
 * Умные сценарии продукта sales (цепочки роботов CRM, запуск вручную).
 *
 * Механизм установки — БЕЗ участия бэка: сценарии настраиваются ОДИН РАЗ
 * на портале вендора, экспортируются встроенным функционалом Битрикса,
 * архив прикладывается к карточке решения в кабинете; при установке
 * приложения Битрикс сам скачивает архив и добавляет сценарии на портал
 * клиента (apidocs: settings/app-installation/smart-scripts-installation).
 *
 * Здесь — только реестр для экрана прогресса: компоненты фиксируются
 * в marketplace_install_components со статусом skipped/bitrix_archive
 * («устанавливается Битриксом из архива, не бэком»).
 */
export const SALES_SMART_SCENARIOS: SmartScenarioManifestItem[] = [
    {
        product: MarketplaceProduct.SALES,
        code: 'cold-call',
        title: 'Сценарий: холодный обзвон',
    },
];

/** Плейсменты продукта (для активации service — этап 6.9 плана) */
export function getProductPlacements(
    product: MarketplaceProduct,
): PlacementManifestItem[] {
    return SALES_PLACEMENTS.filter(item => item.product === product);
}
