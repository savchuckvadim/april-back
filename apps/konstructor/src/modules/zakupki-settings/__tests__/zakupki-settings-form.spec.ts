import {
    ZAKUPKI_FIELD_CODES,
    buildZakupkiProvidersForm,
    zakupkiValuesToColumns,
} from '../lib/zakupki-settings-form';

describe('zakupki-settings-form', () => {
    it('форма — 9 полей на каждого поставщика с легаси-кодами и значениями строками', () => {
        const form = buildZakupkiProvidersForm({
            provider1_shortname: 'ООО Пирожок',
            provider1_price_coefficient: 1.05,
            provider2_letter_text: null,
        });
        expect(form.provider1).toHaveLength(9);
        expect(form.provider2).toHaveLength(9);
        expect(form.provider1[0]).toMatchObject({
            id: 1,
            code: 'provider1_shortname',
            value: 'ООО Пирожок',
            isRequired: true,
        });
        expect(
            form.provider1.find(
                field => field.code === 'provider1_price_coefficient',
            )?.value,
        ).toBe('1.05');
        expect(
            form.provider2.find(field => field.code === 'provider2_letter_text')
                ?.value,
        ).toBeNull();
        expect(ZAKUPKI_FIELD_CODES).toHaveLength(18);
    });

    it('значения → колонки: коэффициент числом (запятая допустима), мусор и чужие коды отбрасываются', () => {
        expect(
            zakupkiValuesToColumns([
                { code: 'provider1_shortname', value: 'ООО Ромашка' },
                { code: 'provider1_price_coefficient', value: '1,2' },
                { code: 'provider2_price_coefficient', value: 'abc' },
                { code: 'provider2_inn', value: null },
                { code: 'is_default', value: 'true' },
            ]),
        ).toEqual({
            provider1_shortname: 'ООО Ромашка',
            provider1_price_coefficient: 1.2,
            provider2_inn: null,
        });
    });
});
