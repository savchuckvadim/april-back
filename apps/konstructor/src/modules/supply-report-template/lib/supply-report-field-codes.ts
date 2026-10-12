import { getSupplyReportFormFields } from '@app/konstructor/document-supply-report/lib/supply-report-form';

/**
 * Белый список кодов полей формы «Отчёт о поставке».
 *
 * ВЫВОДИТСЯ из самой формы (`getSupplyReportFormFields`), а НЕ переписан
 * руками. Форма — единственный источник правды: фронт-конструктор рисует её
 * по этим кодам и по ним же мержит значения из сделки. Захардкоженная копия
 * списка разошлась бы с формой при первом же добавлении поля, и шаблон начал
 * бы требовать код, которого в форме нет — тихо неработающая настройка.
 *
 * `type` (тип клиента) сюда НЕ входит: это отдельный статический селект
 * (`getClientTypeSelect`) с `group: 'rq'`, а не поле отчёта о поставке.
 * Привязка шаблона к типу клиента выражается колонкой `client_types`.
 */
export const SUPPLY_REPORT_FIELD_CODES: readonly string[] = Object.freeze([
    ...new Set(getSupplyReportFormFields().map(field => field.code)),
]);

/** Набор для O(1)-проверок. */
const CODE_SET = new Set(SUPPLY_REPORT_FIELD_CODES);

export function isSupplyReportFieldCode(code: string): boolean {
    return CODE_SET.has(code);
}

/** Коды, которых нет в форме. Пустой массив — всё валидно. */
export function findUnknownFieldCodes(codes: readonly string[]): string[] {
    return [...new Set(codes.filter(code => !CODE_SET.has(code)))];
}
