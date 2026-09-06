/**
 * Ссылка на карточку разбора в смарт-процессе «AI-анализ звонков» —
 * тот же формат, что у PortalLinks.smartItem недельного Excel
 * (libs/call-lib call-report-excel.builder.ts) и алерта event-sales
 * (buildAlertLink): https://{domain}/crm/type/{entityTypeId}/details/{itemId}/.
 * Класс PortalLinks там приватный, поэтому формат продублирован здесь.
 */
export function buildSmartItemLink(
    domain: string,
    smartEntityTypeId: number | null,
    smartItemId: number | null,
): string | null {
    if (!smartItemId || !smartEntityTypeId) return null;
    return `https://${domain}/crm/type/${smartEntityTypeId}/details/${smartItemId}/`;
}
