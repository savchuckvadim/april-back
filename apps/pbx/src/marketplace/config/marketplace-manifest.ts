/**
 * Манифест маркетплейс-приложения «Менеджер Гарант» — ЭТАЛОН состава.
 *
 * Модель: ВИДЖЕТ (наше встраиваемое мини-приложение: код, фронт-страница,
 * название) × МЕСТА ВСТРОЙКИ (places[] — где виджет показывается в Битриксе).
 * Один виджет может быть встроен в несколько мест; места со временем
 * меняются (убрать из компании, добавить в задачу) — это правка places[]
 * + синхронизация (см. ниже), а НЕ новый виджет.
 *
 * ФРОНТЫ ВИДЖЕТОВ ЖИВУТ НА РАЗНЫХ ДОМЕНАХ (frontUrl у каждого виджета).
 * В Битриксе зарегистрированы только СТАБИЛЬНЫЕ URL нашего роутера
 * (/api/bitrix-marketplace/placement/<code>) — он принимает POST/GET
 * и редиректит на frontUrl. Куда редиректить — подменяемо БЕЗ
 * перерегистрации привязок: правкой frontUrl здесь (деплой) или
 * env-переменной MARKETPLACE_WIDGET_URL_<КОД> (без деплоя, см. роутер).
 *
 * Эталон живёт в коде (одинаков для всех порталов, версионируется с
 * приложением). Факт на конкретном портале — в самом Битриксе
 * (placement.list) и в зеркале marketplace_install_components.
 * Выравнивание факт→эталон делает MarketplacePlacementSyncService
 * (diff: bind недостающих пар, unbind лишних) — при установке и по
 * admin-запросу POST /bitrix-marketplace/admin/placements/refresh.
 *
 * ══════════ КАК ИЗМЕНИТЬ СОСТАВ ВИДЖЕТОВ/МЕСТ ══════════
 * 1. Новый виджет — элемент в MARKETPLACE_WIDGETS (code уникальный,
 *    kebab-case; frontUrl — полный URL страницы виджета).
 *    Смена мест — правка places[]; смена фронта — правка frontUrl
 *    (или env MARKETPLACE_WIDGET_URL_<КОД> без деплоя).
 *    Тип MarketplaceWidgetCode, Swagger-enum роутера, guard и тесты
 *    подхватят изменения АВТОМАТИЧЕСКИ (всё выводится из массива).
 * 2. Страница по frontUrl должна работать в iframe (открывается GET-ом
 *    после redirect; контекст — query: domain, member_id, lang, status,
 *    placement_options — либо клиентски через b24jssdk).
 * 3. Деплой бэка.
 * 4. Существующие порталы: дернуть refresh-синхронизацию
 *    (POST /api/bitrix-marketplace/admin/placements/refresh, заголовок
 *    X-Admin-Key) — она сама забиндит новое и отвяжет убранное.
 *    Смена frontUrl синхронизации НЕ требует (привязки не меняются).
 * 5. Карточка решения: заявленные места встройки должны соответствовать
 *    эталону (после публикации правка карточки = повторная модерация).
 *    Обновить ai/marketplace/APP_PUBLICATION_DATA.md (раздел 3).
 * 6. npm run lint + npx jest apps/pbx/src/marketplace.
 * ════════════════════════════════════════════════════════
 */

export enum MarketplaceProduct {
    SALES = 'sales',
    SERVICE = 'service',
}

/**
 * Компоненты установки (component_type в marketplace_install_components).
 * Канон живёт в @lib/marketplace-core (общий с воркером pbx-install);
 * здесь — ре-экспорт для существующих импортов модуля.
 */
export { MarketplaceComponentType } from '@lib/marketplace-core';

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
     * Код виджета — стабильный HANDLER-URL
     * `/api/bitrix-marketplace/placement/<code>` для ВСЕХ мест встройки
     */
    code: string;
    /** Название вкладки/виджета в интерфейсе Битрикс24 */
    title: string;
    description?: string;
    /** Места встройки (может быть несколько; меняются правкой + refresh) */
    places: readonly BxPlace[];
    /**
     * Полный URL фронта виджета (домены у виджетов РАЗНЫЕ; URL может
     * меняться — правка здесь или env MARKETPLACE_WIDGET_URL_<КОД>).
     * Открывается GET-ом после redirect роутера.
     */
    frontUrl: string;
}

/**
 * Все виджеты приложения (sales — биндятся при установке;
 * service — при активации продукта, план этап 6.9; их места встройки
 * уточняются при запуске service).
 * Места sales — из легаси-привязок (event жил и в сделке, и в компании);
 * отчёты — пункт в левом меню (LEFT_MENU), подтверждено владельцем.
 *
 * frontUrl — отдельные Next-приложения на своих поддоменах
 * (актуализировано 2026-07-20, владелец): konstructor / event-sales /
 * event-service / kpi-sales / kpi-service .april-app.ru. Подмена без
 * деплоя — env MARKETPLACE_WIDGET_URL_<КОД>.
 */
export const MARKETPLACE_WIDGETS = [
    {
        product: MarketplaceProduct.SALES,
        code: 'event-sales',
        title: 'Гарант: Звонки',
        description: 'Виджет звонков и событий',
        places: ['CRM_DEAL_DETAIL_TAB', 'CRM_COMPANY_DETAIL_TAB'],
        frontUrl: 'https://event-sales.april-app.ru/',
    },
    {
        product: MarketplaceProduct.SALES,
        code: 'konstructor',
        title: 'Гарант: Конструктор КП',
        description: 'Конструктор коммерческих предложений',
        places: ['CRM_DEAL_DETAIL_TAB'],
        frontUrl: 'https://konstructor.april-app.ru/',
    },
    {
        product: MarketplaceProduct.SALES,
        code: 'report-sales',
        title: 'Гарант: Отчёт ОП KPI',
        description: 'Отчёты отдела продаж',
        places: ['LEFT_MENU'],
        frontUrl: 'https://kpi-sales.april-app.ru/',
    },
    {
        product: MarketplaceProduct.SERVICE,
        code: 'event-service',
        title: 'Гарант: Звонки (сервис)',
        description: 'Виджет звонков сервисного направления',
        places: ['CRM_DEAL_DETAIL_TAB', 'CRM_COMPANY_DETAIL_TAB'],
        frontUrl: 'https://event-service.april-app.ru/',
    },
    {
        // TODO(владелец): отдельного поддомена под service-конструктор нет —
        // временно тот же konstructor.april-app.ru. Уточнить при запуске
        // продукта service (или задать MARKETPLACE_WIDGET_URL_KONSTRUCTOR_SERVICE).
        product: MarketplaceProduct.SERVICE,
        code: 'konstructor-service',
        title: 'Гарант: Конструктор КП (сервис)',
        description: 'Конструктор КП сервисного направления',
        places: ['CRM_DEAL_DETAIL_TAB'],
        frontUrl: 'https://konstructor.april-app.ru/',
    },
    {
        product: MarketplaceProduct.SERVICE,
        code: 'report-service',
        title: 'Гарант: Отчёт КЦ KPI',
        description: 'Отчёты сервисного направления',
        places: ['LEFT_MENU'],
        frontUrl: 'https://kpi-service.april-app.ru/',
    },
] as const satisfies readonly WidgetManifestItem[];

/**
 * Код виджета — ЗАКРЫТОЕ перечисление, выводится из эталона.
 * Ровно эти коды регистрируются как HANDLER-URL в placement.bind;
 * неизвестный код в роутере = рассинхрон эталона с привязками.
 */
export type MarketplaceWidgetCode =
    (typeof MARKETPLACE_WIDGETS)[number]['code'];

/** Все допустимые коды виджетов (для Swagger и валидации) */
export const MARKETPLACE_WIDGET_CODES: readonly MarketplaceWidgetCode[] =
    MARKETPLACE_WIDGETS.map(item => item.code);

/** Type guard: известен ли код виджета эталону */
export function isKnownWidgetCode(code: string): code is MarketplaceWidgetCode {
    return MARKETPLACE_WIDGETS.some(item => item.code === code);
}

/** Виджет эталона по коду */
export function findWidgetByCode(code: string): WidgetManifestItem | undefined {
    return MARKETPLACE_WIDGETS.find(item => item.code === code);
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
    return MARKETPLACE_WIDGETS.filter(widget =>
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
