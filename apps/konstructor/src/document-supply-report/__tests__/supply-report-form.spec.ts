import {
    getSupplyReportFormFields,
    SupplyReportFormSelectItem,
} from '../lib/supply-report-form';

/**
 * Форма отчёта о поставке: фронт рисует её по кодам полей и по ним же мержит
 * текущие значения из сделки. Расхождение с Laravel ломает форму молча.
 */
describe('getSupplyReportFormFields', () => {
    it('отдаёт все 15 активных полей формы в порядке Laravel', () => {
        const codes = getSupplyReportFormFields().map(field => field.code);

        expect(codes).toEqual([
            'sale_date',
            'in_ork',
            'client_call_date',
            'in_arm',
            'invoice_pay_type',
            'finance',
            'is_contract_done',
            'contract_number',
            'contract_result',
            'current_contract',
            'is_invoice_done',
            'invoice_number',
            'invoice_result',
            'current_invoice',
            'situation_comments',
        ]);
    });

    it('у каждого поля есть группа supply и списки видимости', () => {
        for (const field of getSupplyReportFormFields()) {
            expect(field.group).toBe('supply');
            expect(field.includes).toContain('org');
            expect(field.supplies).toEqual(['internet', 'proxima']);
            expect(field.contractType).toEqual([
                'service',
                'lic',
                'abon',
                'key',
            ]);
        }
    });

    it('у селектов есть items, и значение по умолчанию лежит среди них', () => {
        const selects = getSupplyReportFormFields().filter(
            field => field.type === 'select',
        );
        expect(selects).toHaveLength(8);

        for (const field of selects) {
            const value = field.value as SupplyReportFormSelectItem;
            expect(field.items?.map(item => item.code)).toContain(value.code);
        }
    });

    it('судьба счёта — оплачен/на оплате: коды, которые ждёт фронт', () => {
        const invoiceResult = getSupplyReportFormFields().find(
            field => field.code === 'invoice_result',
        );

        expect(invoiceResult?.items?.map(item => item.code)).toEqual([
            'done',
            'in_progress',
        ]);
    });

    it('возвращает новую копию: правка значения не течёт в следующий вызов', () => {
        const first = getSupplyReportFormFields();
        first[0].value = '2026-09-15';

        expect(getSupplyReportFormFields()[0].value).toBe('');
    });
});
