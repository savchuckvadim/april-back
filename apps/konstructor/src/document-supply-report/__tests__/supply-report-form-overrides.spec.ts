import { getSupplyReportFormFields } from '../lib/supply-report-form';

/**
 * Портальная настройка состава формы отчёта.
 *
 * ГЛАВНОЕ ИНВАРИАНТ: docxtemplater КИДАЕТ, если тег из .docx отсутствует в
 * данных рендера, а фронт мержит значения из сделки по коду поля. Поэтому
 * настройка не имеет права ни переупорядочить, ни выбросить поле — она
 * меняет ровно `isRequired`. Эти тесты и сторожат именно это.
 */
describe('getSupplyReportFormFields — портальные overrides', () => {
    const codesOf = (
        overrides?: Parameters<typeof getSupplyReportFormFields>[0],
    ) => getSupplyReportFormFields(overrides).map(field => field.code);

    const BASE_CODES = codesOf();

    it('без настройки — ровно то же, что было до её появления', () => {
        expect(getSupplyReportFormFields(undefined)).toEqual(
            getSupplyReportFormFields(),
        );
        expect(getSupplyReportFormFields({})).toEqual(
            getSupplyReportFormFields(),
        );
    });

    it('НЕ ПЕРЕУПОРЯДОЧИВАЕТ: порядок кодов совпадает с кодовым', () => {
        const codes = codesOf({
            // настройка перечислена в заведомо другом порядке
            requiredCodes: ['situation_comments', 'contract_number'],
            optionalCodes: ['sale_date', 'in_ork'],
        });

        expect(codes).toEqual(BASE_CODES);
    });

    it('НЕ ВЫБРАСЫВАЕТ: набор остаётся надмножеством кодового', () => {
        // в настройке назван ровно один код — остальные 14 обязаны остаться
        const codes = codesOf({ requiredCodes: ['contract_number'] });

        expect(codes).toHaveLength(BASE_CODES.length);
        for (const code of BASE_CODES) {
            expect(codes).toContain(code);
        }
    });

    it('НЕ ДОБАВЛЯЕТ поля под незнакомый код', () => {
        const codes = codesOf({
            requiredCodes: ['нет_такого_поля', 'тоже_нет'],
            optionalCodes: ['и_этого'],
        });

        expect(codes).toEqual(BASE_CODES);
    });

    it('requiredCodes делает поле обязательным', () => {
        // contract_number в коде isRequired: false
        const before = getSupplyReportFormFields().find(
            f => f.code === 'contract_number',
        );
        expect(before?.isRequired).toBe(false);

        const after = getSupplyReportFormFields({
            requiredCodes: ['contract_number'],
        }).find(f => f.code === 'contract_number');

        expect(after?.isRequired).toBe(true);
    });

    it('optionalCodes снимает обязательность', () => {
        // sale_date в коде isRequired: true
        const before = getSupplyReportFormFields().find(
            f => f.code === 'sale_date',
        );
        expect(before?.isRequired).toBe(true);

        const after = getSupplyReportFormFields({
            optionalCodes: ['sale_date'],
        }).find(f => f.code === 'sale_date');

        expect(after?.isRequired).toBe(false);
    });

    it('код в обоих списках: побеждает НЕобязательное — опечатка не блокирует менеджера', () => {
        const field = getSupplyReportFormFields({
            requiredCodes: ['sale_date'],
            optionalCodes: ['sale_date'],
        }).find(f => f.code === 'sale_date');

        expect(field?.isRequired).toBe(false);
    });

    it('не названные в настройке поля сохраняют кодовый isRequired', () => {
        const base = new Map(
            getSupplyReportFormFields().map(f => [f.code, f.isRequired]),
        );

        for (const field of getSupplyReportFormFields({
            requiredCodes: ['contract_number'],
        })) {
            if (field.code === 'contract_number') {
                continue;
            }
            expect(field.isRequired).toBe(base.get(field.code));
        }
    });

    it('меняется ТОЛЬКО isRequired: остальные свойства поля нетронуты', () => {
        const before = getSupplyReportFormFields().find(
            f => f.code === 'contract_number',
        );
        const after = getSupplyReportFormFields({
            requiredCodes: ['contract_number'],
        }).find(f => f.code === 'contract_number');

        expect({ ...after, isRequired: before?.isRequired }).toEqual(before);
    });

    it('возвращается новая копия: мутация результата не портит следующий вызов', () => {
        const first = getSupplyReportFormFields({
            requiredCodes: ['contract_number'],
        });
        first[0].isRequired = !first[0].isRequired;
        first[0].name = 'испорчено';

        const second = getSupplyReportFormFields({
            requiredCodes: ['contract_number'],
        });

        expect(second[0].name).not.toBe('испорчено');
    });
});
