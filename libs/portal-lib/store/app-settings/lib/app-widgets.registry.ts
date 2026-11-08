/**
 * РЕЕСТР приложения «April» на портале: ЧАСТИ (отдел продаж / отдел
 * сервиса) и ВИДЖЕТЫ (встраиваемые мини-приложения) с привязкой к части.
 *
 * Единственный источник кодов для настроек портала `enabled_parts` и
 * `app_widgets` (реестр настроек) и для манифеста маркетплейс-модуля
 * (apps/pbx — там к коду добавляются места встройки и адрес фронта).
 * Новый виджет заводится ЗДЕСЬ (код + название + часть), иначе манифест
 * его не примет на уровне типов.
 *
 * Коды стабильны навсегда: `app_widgets` хранит их CSV в JSON портала,
 * а HANDLER-URL привязок в Битриксе заканчивается кодом виджета.
 */

/** Части приложения — крупные блоки функционала портала. */
export const APP_PARTS = [
    { code: 'sales', name: 'Отдел продаж' },
    { code: 'service', name: 'Отдел сервиса' },
] as const;

export type AppPartCode = (typeof APP_PARTS)[number]['code'];

/** Runtime-массив кодов частей — для проверок и Swagger. */
export const APP_PART_CODES: readonly AppPartCode[] = APP_PARTS.map(
    part => part.code,
);

/** Виджеты приложения: код = хвост HANDLER-URL привязки в Битриксе. */
export const APP_WIDGETS = [
    { code: 'event-sales', part: 'sales', name: 'Звонки (отдел продаж)' },
    { code: 'konstructor', part: 'sales', name: 'Конструктор КП' },
    { code: 'report-sales', part: 'sales', name: 'Отчёт ОП KPI' },
    { code: 'event-service', part: 'service', name: 'Звонки (сервис)' },
    {
        code: 'konstructor-service',
        part: 'service',
        name: 'Конструктор КП (сервис)',
    },
    { code: 'report-service', part: 'service', name: 'Отчёт КЦ KPI' },
] as const satisfies readonly {
    code: string;
    part: AppPartCode;
    name: string;
}[];

export type AppWidgetCode = (typeof APP_WIDGETS)[number]['code'];

/** Runtime-массив кодов виджетов — для проверок и Swagger. */
export const APP_WIDGET_CODES: readonly AppWidgetCode[] = APP_WIDGETS.map(
    widget => widget.code,
);

export function isAppWidgetCode(value: string): value is AppWidgetCode {
    return (APP_WIDGET_CODES as readonly string[]).includes(value);
}

export function isAppPartCode(value: string): value is AppPartCode {
    return (APP_PART_CODES as readonly string[]).includes(value);
}

/**
 * Разбор CSV-значения списковой настройки в коды реестра.
 * Чужие и пустые значения отбрасываются: настройка — не место для опечаток.
 */
export function parseAppWidgetCodes(csv: string): AppWidgetCode[] {
    return splitCsv(csv).filter(isAppWidgetCode);
}

export function parseAppPartCodes(csv: string): AppPartCode[] {
    return splitCsv(csv).filter(isAppPartCode);
}

/** Коды всех виджетов части — «полная установка» части. */
export function widgetCodesOfPart(part: AppPartCode): AppWidgetCode[] {
    return APP_WIDGETS.filter(widget => widget.part === part).map(
        widget => widget.code,
    );
}

function splitCsv(csv: string): string[] {
    return [...new Set(csv.split(',').map(item => item.trim()))].filter(
        item => item.length > 0,
    );
}
