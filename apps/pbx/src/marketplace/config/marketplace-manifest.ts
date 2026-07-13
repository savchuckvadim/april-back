/**
 * Манифест маркетплейс-приложения «Менеджер Гарант» — ЭТАЛОН состава.
 *
 * Модель: ВИДЖЕТ (наше встраиваемое мини-приложение: код, страница фронта,
 * название) × МЕСТА ВСТРОЙКИ (places[] — где виджет показывается в Битриксе).
 * Один виджет может быть встроен в несколько мест; места со временем
 * меняются (убрать из компании, добавить в задачу) — это правка places[]
 * + синхронизация (см. ниже), а НЕ новый виджет.
 *
 * Эталон живёт в коде (одинаков для всех порталов, версионируется с
 * приложением). Факт на конкретном портале — в самом Битриксе
 * (placement.list) и в зеркале marketplace_install_components.
 * Выравнивание факт→эталон делает MarketplacePlacementSyncService
 * (diff: bind недостающих пар, unbind лишних) — при установке и по
 * admin-запросу POST /bitrix-marketplace/admin/placements/refresh.
 *
 * ══════════ КАК ИЗМЕНИТЬ СОСТАВ ВИДЖЕТОВ/МЕСТ ══════════
 * 1. Новый виджет — элемент в SALES_WIDGETS (code уникальный, kebab-case).
 *    Смена мест у виджета — правка его places[] (добавить/убрать место).
 *    Тип SalesWidgetCode, Swagger-enum роутера, guard и тесты подхватят
 *    изменения АВТОМАТИЧЕСКИ (всё выводится из массива).
 * 2. Для нового виджета — страница фронта:
 *    `${MARKETPLACE_PLACEMENT_REDIRECT_BASE}/<code>`.
 * 3. Деплой бэка (и фронта, если п.2).
 * 4. Существующие порталы: дернуть refresh-синхронизацию
 *    (POST /api/bitrix-marketplace/admin/placements/refresh, заголовок
 *    X-Admin-Key) — она сама забиндит новое и отвяжет убранное.
 *    Новые установки получают актуальный эталон автоматически.
 * 5. Карточка решения: заявленные места встройки должны соответствовать
 *    эталону (после публикации правка карточки = повторная модерация).
 *    Обновить ai/marketplace/APP_PUBLICATION_DATA.md (раздел 3).
 * 6. pnpm run lint + npx jest apps/pbx/src/marketplace.
 * ════════════════════════════════════════════════════════
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

/**
 * Места встройки Битрикс24, которые использует приложение.
 * Известные — с автокомплитом; `string & {}` оставляет тип открытым
 * для любых других мест из справочника Битрикса
 * (https://apidocs.bitrix24.ru/api-reference/widgets/placements.html).
 */
export type BxPlace =
    | 'CRM_DEAL_DETAIL_TAB'
    | 'CRM_COMPANY_DETAIL_TAB'
    | 'CRM_LEAD_DETAIL_TAB'
    | 'CRM_CONTACT_DETAIL_TAB'
    | 'TASK_VIEW_TAB'
    | 'LEFT_MENU' // пункт в левом меню (сайдбар) основного окна Битрикса
    | (string & {});

export interface WidgetManifestItem {
    /** Продукт, которому принадлежит виджет */
    product: MarketplaceProduct;
    /**
     * Код виджета — единая страница фронта и HANDLER-URL
     * `/api/bitrix-marketplace/placement/<code>` для ВСЕХ мест встройки
     */
    code: string;
    /** Название вкладки/виджета в интерфейсе Битрикс24 */
    title: string;
    description?: string;
    /** Места встройки (может быть несколько; меняются правкой + refresh) */
    places: readonly BxPlace[];
}

/**
 * Виджеты продукта sales.
 * Места — из легаси-привязок (event_sales жил и в сделке, и в компании);
 * отчёты — пункт в левом меню (LEFT_MENU), подтверждено владельцем.
 */
export const SALES_WIDGETS = [
    {
        product: MarketplaceProduct.SALES,
        code: 'event-sales',
        title: 'Гарант: Звонки',
        description: 'Виджет звонков и событий',
        places: ['CRM_DEAL_DETAIL_TAB', 'CRM_COMPANY_DETAIL_TAB'],
    },
    {
        product: MarketplaceProduct.SALES,
        code: 'konstructor',
        title: 'Гарант: Конструктор КП',
        description: 'Конструктор коммерческих предложений',
        places: ['CRM_DEAL_DETAIL_TAB'],
    },
    {
        product: MarketplaceProduct.SALES,
        code: 'report-sales',
        title: 'Гарант: Отчёт ОП KPI',
        description: 'Отчёты отдела продаж',
        places: ['LEFT_MENU'],
    },
] as const satisfies readonly WidgetManifestItem[];

/**
 * Код виджета — ЗАКРЫТОЕ перечисление, выводится из манифеста:
 * 'event-sales' | 'konstructor' | 'report-sales'.
 * Ровно эти коды регистрируются как HANDLER-URL в placement.bind;
 * неизвестный код в роутере = рассинхрон эталона с привязками.
 */
export type SalesWidgetCode = (typeof SALES_WIDGETS)[number]['code'];

/** Все допустимые коды виджетов (для Swagger и валидации) */
export const SALES_WIDGET_CODES: readonly SalesWidgetCode[] = SALES_WIDGETS.map(
    item => item.code,
);

/** Type guard: известен ли код виджета эталону */
export function isKnownWidgetCode(code: string): code is SalesWidgetCode {
    return SALES_WIDGETS.some(item => item.code === code);
}

/** Виджет эталона по коду */
export function findWidgetByCode(code: string): WidgetManifestItem | undefined {
    return SALES_WIDGETS.find(item => item.code === code);
}

/** Целевая привязка: пара «виджет × место встройки» */
export interface DesiredBinding {
    widget: WidgetManifestItem;
    place: BxPlace;
}

/**
 * Развёртка эталона в плоский список целевых привязок для продуктов —
 * то, что должно быть забиндено на портале (вход diff-синхронизации).
 */
export function getDesiredBindings(
    products: readonly MarketplaceProduct[],
): DesiredBinding[] {
    return SALES_WIDGETS.filter(widget =>
        products.includes(widget.product),
    ).flatMap((widget: WidgetManifestItem) =>
        widget.places.map((place: BxPlace) => ({ widget, place })),
    );
}

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
