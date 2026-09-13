import { PBX_SALES_KONSTRUCTOR_FIELDS } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    COMPLECT_VARIANT_SMART_CODE,
    COMPLECT_VARIANT_SMART_FIELDS,
    COMPLECT_VARIANT_SMART_STAGES,
    complectVariantStageBitrixId,
} from '../type/pbx-complect-variant-smart.type';
import { COMPLECT_VARIANT_SMART_DESCRIPTOR } from '../type/pbx-complect-variant-smart.descriptor';
import { buildComplectVariantInstallFields } from '../type/pbx-complect-variant-smart-field.type';

/**
 * Поля варианта выводятся из канона konstructor-полей сделки, а не копируются
 * руками: две копии списка неизбежно разъедутся.
 */
describe('Варианты комплекта: состав смарта', () => {
    it('код установки собран из типа и группы', () => {
        expect(COMPLECT_VARIANT_SMART_CODE).toBe('complect_variant_sales');
    });

    it('служебные поля варианта идут первыми', () => {
        const firstCodes = COMPLECT_VARIANT_SMART_FIELDS.slice(0, 3).map(
            field => field.code,
        );
        expect(firstCodes).toEqual([
            'VARIANT_NAME',
            'VARIANT_COMMENT',
            'VARIANT_SOURCE_IDS',
        ]);
    });

    it('konstructor-поля сделки зеркалятся в смарт', () => {
        const codes = COMPLECT_VARIANT_SMART_FIELDS.map(field => field.code);

        // из канона: у одних суффикс задан колонкой smart, у других — код
        expect(codes).toContain('COMPLECT_NAME');
        expect(codes).toContain('NPA');
        expect(codes).toContain('STAR');
        expect(codes).toContain('QUANTITY_FOR_KP');
    });

    it('UF-суффиксы уникальны — Битрикс не примет два поля с одним именем', () => {
        const codes = COMPLECT_VARIANT_SMART_FIELDS.map(field => field.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('«множественные» поля канона становятся строковыми списками', () => {
        const multipleCanonCodes = PBX_SALES_KONSTRUCTOR_FIELDS.filter(
            field => field.type === 'multiple',
        ).map(field => (field.smart ? field.smart : field.code.toUpperCase()));

        const npa = COMPLECT_VARIANT_SMART_FIELDS.find(
            field => field.code === 'NPA',
        );
        expect(multipleCanonCodes).toContain('NPA');
        expect(npa?.type).toBe('string');
        expect(npa?.isMultiple).toBe(true);
    });

    it('fieldsCount дескриптора считается из состава, а не задан числом', () => {
        expect(COMPLECT_VARIANT_SMART_DESCRIPTOR.fieldsCount).toBe(
            COMPLECT_VARIANT_SMART_FIELDS.length,
        );
    });

    it('у типа включены товарные строки: вариант без состава продажи бессмыслен', () => {
        expect(COMPLECT_VARIANT_SMART_DESCRIPTOR.hasProductRows).toBe(true);
        expect(COMPLECT_VARIANT_SMART_DESCRIPTOR.hasCategories).toBe(true);
    });

    it('install-поля отдают сырые суффиксы: префикс добавит установщик', () => {
        const installFields = buildComplectVariantInstallFields();

        expect(installFields).toHaveLength(
            COMPLECT_VARIANT_SMART_FIELDS.length,
        );
        expect(installFields[0].bxFieldName).toBe('VARIANT_NAME');
        expect(installFields[0].bxFieldName).not.toMatch(/^UF_CRM_/);
    });

    it('стадии — статус варианта, черновик первый', () => {
        expect(COMPLECT_VARIANT_SMART_STAGES[0].code).toBe('cvar_draft');
        expect(COMPLECT_VARIANT_SMART_STAGES.map(stage => stage.code)).toEqual([
            'cvar_draft',
            'cvar_current',
            'cvar_merged',
            'cvar_rejected',
        ]);
    });

    it('суффикс STATUS_ID отрезает префикс кода стадии', () => {
        expect(complectVariantStageBitrixId('cvar_current')).toBe('CURRENT');
    });
});
