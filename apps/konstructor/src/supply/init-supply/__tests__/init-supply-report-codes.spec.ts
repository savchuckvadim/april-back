import { getSupplyReportFormFields } from '../../../document-supply-report/lib/supply-report-form';
import { SupplyReportCodeEnum } from '../dto/supply-fields/supply-fields.dto';

/**
 * Форма отчёта о поставке уходит в init-supply целиком (`supplyReport`), а DTO
 * проверяет код каждого поля через `@IsEnum(SupplyReportCodeEnum)`. Поле формы,
 * которого нет в enum, роняет запрос в 400 — отчёт создан, а заявка RPA нет
 * (так было с `invoice_number`, gsr, 26.10.2026).
 */
describe('SupplyReportCodeEnum', () => {
    it('принимает код каждого поля формы отчёта о поставке', () => {
        const allowed = new Set<string>(Object.values(SupplyReportCodeEnum));

        const unknown = getSupplyReportFormFields()
            .map(field => field.code)
            .filter(code => !allowed.has(code));

        expect(unknown).toEqual([]);
    });
});
