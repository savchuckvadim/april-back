/**
 * Реэкспорт типизации смарта «AI-анализ звонков».
 *
 * Канонический источник — pbx-модуль сущности (связка portal↔bitrix):
 * @lib/portal-lib/pbx/pbx-aicall-smart. Здесь оставлен реэкспорт для
 * обратной совместимости импортов call-lib / event-sales / admin.
 */
import {
    AicallSmartInfo,
    buildCallReportItemFieldName,
} from '@lib/portal-lib/pbx/pbx-aicall-smart';

export * from '@lib/portal-lib/pbx/pbx-aicall-smart';

/**
 * UF-ключ поля элемента смарта по коду конфига.
 *
 * Канонический источник — зеркало портала (`ufKeyByCode` из PortalModel /
 * PortalDB); fallback — сборка по typeId (id из crm.type.list — основа
 * UF-имён, НЕ entityTypeId; см. доки userfieldconfig).
 *
 * Вынесено из writer'а, потому что те же ключи нужны и ЧИТАТЕЛЮ связей
 * (пересчёт связей ночным ревизором): имя поля обязано считаться в одном
 * месте, иначе читатель и писатель разъедутся.
 */
export function callReportSmartUfName(
    info: AicallSmartInfo,
    code: string,
): string {
    return (
        info.ufKeyByCode?.[code] ??
        buildCallReportItemFieldName(info.typeId ?? info.entityTypeId, code)
    );
}
