import { PBX_SALES_KONSTRUCTOR_FIELDS } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import {
    buildComplectVariantStageId,
    COMPLECT_VARIANT_FINAL_STAGES,
    COMPLECT_VARIANT_SMART_CODE,
    COMPLECT_VARIANT_SMART_FIELDS,
    COMPLECT_VARIANT_SMART_STAGES,
    COMPLECT_VARIANT_STAGE,
    complectVariantStageBitrixId,
    resolveComplectVariantStageCode,
} from '../type/pbx-complect-variant-smart.type';
import { COMPLECT_VARIANT_SMART_DESCRIPTOR } from '../type/pbx-complect-variant-smart.descriptor';
import {
    buildComplectVariantInstallCategories,
    buildComplectVariantInstallFields,
} from '../type/pbx-complect-variant-smart-field.type';

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
        // дефолтная стадия в Битриксе — первая по SORT, менять нельзя
        expect(COMPLECT_VARIANT_SMART_STAGES[0].code).toBe('cvar_draft');
        expect(COMPLECT_VARIANT_SMART_STAGES.map(stage => stage.code)).toEqual([
            'cvar_draft',
            'cvar_current',
            'cvar_merged',
            'cvar_offer',
            'cvar_invoice',
            'cvar_contract',
            'cvar_supply',
            'cvar_approval',
            'cvar_success',
            'cvar_rejected',
            'cvar_failed',
        ]);
    });

    it('коды старых стадий не поменялись — иначе элементы на них осиротеют', () => {
        const codes = COMPLECT_VARIANT_SMART_STAGES.map(stage => stage.code);

        for (const code of [
            'cvar_draft',
            'cvar_current',
            'cvar_merged',
            'cvar_rejected',
        ]) {
            expect(codes).toContain(code);
        }
        // суффикс STATUS_ID выводится из кода — значит и он прежний
        expect(complectVariantStageBitrixId('cvar_rejected')).toBe('REJECTED');
    });

    it('успех перед провалами, провалы — в конце по sort', () => {
        const sorted = [...COMPLECT_VARIANT_SMART_STAGES].sort(
            (a, b) => a.sort - b.sort,
        );

        // порядок в массиве уже отсортирован: reconcile заливает по order
        expect(sorted.map(stage => stage.code)).toEqual(
            COMPLECT_VARIANT_SMART_STAGES.map(stage => stage.code),
        );
        expect(sorted[sorted.length - 1].semantics).toBe('F');
        expect(sorted[sorted.length - 2].semantics).toBe('F');
        expect(sorted[sorted.length - 3].code).toBe('cvar_success');
        expect(sorted[sorted.length - 3].semantics).toBe('S');
    });

    it('sort уникален: две стадии с одним order встанут как попало', () => {
        const sorts = COMPLECT_VARIANT_SMART_STAGES.map(stage => stage.sort);
        expect(new Set(sorts).size).toBe(sorts.length);
    });

    it('суффиксы STATUS_ID уникальны — иначе стадии схлопнутся', () => {
        const suffixes = COMPLECT_VARIANT_SMART_STAGES.map(stage =>
            complectVariantStageBitrixId(stage.code),
        );
        expect(new Set(suffixes).size).toBe(suffixes.length);
    });

    it('суффикс STATUS_ID отрезает префикс кода стадии', () => {
        expect(complectVariantStageBitrixId('cvar_current')).toBe('CURRENT');
    });

    it('у каждой стадии свой цвет в установочном контракте', () => {
        const [category] = buildComplectVariantInstallCategories();

        expect(category.stages).toHaveLength(
            COMPLECT_VARIANT_SMART_STAGES.length,
        );
        const colors = category.stages.map(stage => stage.color);
        // одинаковый цвет = забытая стадия в карте (сработал фолбэк)
        expect(new Set(colors).size).toBe(colors.length);
    });

    it('код стадии читается из stageId элемента', () => {
        expect(resolveComplectVariantStageCode('DT1046_3:SUCCESS')).toBe(
            'cvar_success',
        );
        expect(resolveComplectVariantStageCode('DT1046_3:FAILED')).toBe(
            'cvar_failed',
        );
        // чужая или пустая стадия — не наш вариант
        expect(resolveComplectVariantStageCode('DT999_1:SOMETHING')).toBeNull();
        expect(resolveComplectVariantStageCode('')).toBeNull();
    });

    it('новый stageId берёт воронку у элемента, а не у дефолтной категории', () => {
        expect(
            buildComplectVariantStageId(
                'DT1046_7:DRAFT',
                COMPLECT_VARIANT_STAGE.SUCCESS,
            ),
        ).toBe('DT1046_7:SUCCESS');
    });

    it('без текущей стадии новый stageId не построить', () => {
        expect(
            buildComplectVariantStageId(null, COMPLECT_VARIANT_STAGE.SUCCESS),
        ).toBeNull();
        // без ':' префикс воронки неизвестен — угадывать нельзя
        expect(
            buildComplectVariantStageId(
                'DRAFT',
                COMPLECT_VARIANT_STAGE.SUCCESS,
            ),
        ).toBeNull();
    });

    it('финальными считаются успех и оба провала', () => {
        expect([...COMPLECT_VARIANT_FINAL_STAGES]).toEqual([
            'cvar_success',
            'cvar_rejected',
            'cvar_failed',
        ]);
    });
});
