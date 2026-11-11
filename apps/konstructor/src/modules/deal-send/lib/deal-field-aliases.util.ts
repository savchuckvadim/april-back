import type { PbxSalesKonstructorFieldCode } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import type { DealSendFieldDto } from '../dto/deal-send.dto';

/**
 * Коды полей СДЕЛКИ, которые канон знает под двумя именами.
 *
 * `quantity_for_kp` («Количество для КП») и `offer_supply_q` («Количество
 * одновременных доступов») — одно значение `product.quantityForKp`. Легаси
 * писал его в field_1 = UF_CRM_1689656448, а в каноне это `offer_supply_q`;
 * шаблоны документов читают именно его (isInTemplate). `quantity_for_kp`
 * указывает на новое поле UF_CRM_QUANTITY_FOR_KP, которого на порталах нет,
 * и значение уходило в skipped (gsr, 11.11.2026). Ставить новое поле нельзя:
 * на сделке появились бы два поля с одним смыслом, а шаблоны остались бы на
 * старом. Смарт не трогаем — у него старого поля нет.
 */
const DEAL_FIELD_CODE_ALIASES: ReadonlyArray<{
    from: PbxSalesKonstructorFieldCode;
    to: PbxSalesKonstructorFieldCode;
}> = [{ from: 'quantity_for_kp', to: 'offer_supply_q' }];

/**
 * Переименовывает код в существующее поле портала.
 *
 * Алиас срабатывает, только если целевое поле на портале есть — иначе код
 * остаётся как пришёл. Явно присланное значение целевого кода сильнее:
 * тогда исходный код просто отбрасывается.
 */
export const applyDealFieldAliases = (
    fields: DealSendFieldDto[],
    hasDealField: (code: PbxSalesKonstructorFieldCode) => boolean,
): DealSendFieldDto[] => {
    let result = fields;
    for (const { from, to } of DEAL_FIELD_CODE_ALIASES) {
        if (!result.some(field => field.code === from) || !hasDealField(to)) {
            continue;
        }
        result = result.some(field => field.code === to)
            ? result.filter(field => field.code !== from)
            : result.map(field =>
                  field.code === from ? { ...field, code: to } : field,
              );
    }
    return result;
};
