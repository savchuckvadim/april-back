import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { planOfferPdfPrint } from '../lib/offer-pdf-print-plan';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import {
    compositionOf,
    garantRow,
    garantSet,
    pdfRequestOf,
    variantOf,
} from './fixtures/offer-pdf-variants.fixture';

/**
 * План печати — развилка PDF-КП: от режима зависят число документов, их
 * названия и склейка. Режим определяет та же функция, что у Word-КП.
 */
const firstSetName = (
    plan: ReturnType<typeof planOfferPdfPrint>,
    unit = 0,
): string | undefined =>
    plan.units[unit].input.sets.general[0]?.rows?.garant?.[0]?.name;

describe('план печати PDF-КП', () => {
    it('без вариантов — один документ из полей запроса, без названия варианта', () => {
        const dto = pdfRequestOf();
        const plan = planOfferPdfPrint(dto);

        expect(plan.mode).toBe('single');
        expect(plan.units).toHaveLength(1);
        expect(plan.units[0].variantTitle).toBeNull();
        expect(plan.units[0].input.sets).toBe(dto.sets);
        expect(plan.units[0].input.total).toBe(dto.total);
        expect(plan.units[0].input.contractType).toBe(dto.contractType);
        expect(plan.units[0].input).not.toHaveProperty('variants');
        expect(plan.units[0].input).not.toHaveProperty('composition');
        expect(plan.warnings).toEqual([]);
    });

    it('пустой список вариантов — то же самое, что их отсутствие', () => {
        const plan = planOfferPdfPrint(pdfRequestOf({ variants: [] }));
        expect(plan.mode).toBe('single');
        expect(plan.units).toHaveLength(1);
        expect(firstSetName(plan)).toBe('Бухгалтерия');
    });

    it('один вариант — печатается этот вариант, названия на листе нет', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({ variants: [variantOf('Юрист', 11)] }),
        );

        expect(plan.mode).toBe('single');
        expect(plan.units).toHaveLength(1);
        expect(firstSetName(plan)).toBe('Юрист');
        expect(plan.units[0].variantTitle).toBeNull();
        expect(plan.units[0].input.contractType).toBe(CONTRACT_LTYPE.ABON);
    });

    it('несколько вариантов без настроек сборки — compare: открытый первый', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
            }),
        );

        expect(plan.mode).toBe('compare');
        expect(plan.units).toHaveLength(1);
        expect(firstSetName(plan)).toBe('Юрист');
        expect(plan.units[0].variantTitle).toBeNull();
        expect(plan.units[0].input.sets.alternative).toEqual([]);
    });

    it('compare + showAlternatives — основные наборы остальных идут наборами «для сравнения»', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
                composition: compositionOf(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            }),
        );

        expect(plan.units).toHaveLength(1);
        const [alternative] = plan.units[0].input.sets.alternative;
        expect(alternative.rows.garant?.[0].name).toBe('Бухгалтер');
    });

    it('merged — один документ из слитого варианта, предупреждения слияния в плане', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantOf('Юрист', 11, { sum: 100, quantity: 12 }),
                    variantOf('Бухгалтер', 12, { sum: 200, quantity: 6 }),
                ],
                composition: compositionOf(ComplectModeEnum.SINGLE_CONTRACT, {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                }),
            }),
        );

        expect(plan.mode).toBe('merged');
        expect(plan.units).toHaveLength(1);
        expect(plan.units[0].variantTitle).toBeNull();
        expect(plan.units[0].input.total.price.sum).toBe(300);
        expect(plan.units[0].input.sets.general).toHaveLength(2);
        expect(plan.warnings).toHaveLength(1);
        expect(plan.warnings[0]).toContain('срок набора');
    });

    it('independent — документ на вариант, у каждого своё название; настройки PDF общие', () => {
        const dto = pdfRequestOf({
            variants: [
                variantOf('Юрист', 11),
                variantOf('Бухгалтер', 12),
                variantOf('Кадровик', 13),
            ],
            composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT),
            templateCode: OfferPdfTemplateCode.PRISM,
            palette: 'garant',
            documentNumber: 'КП-1042',
            settings: { withStamps: false },
            letter: { appeal: 'Здравствуйте!' },
        });
        const plan = planOfferPdfPrint(dto);

        expect(plan.mode).toBe('independent');
        expect(plan.separateDocuments).toBe(false);
        expect(plan.units.map(unit => unit.variantTitle)).toEqual([
            'Юрист',
            'Бухгалтер',
            'Кадровик',
        ]);
        expect(
            plan.units.map((_unit, index) => firstSetName(plan, index)),
        ).toEqual(['Юрист', 'Бухгалтер', 'Кадровик']);
        for (const { input } of plan.units) {
            expect(input.templateCode).toBe(OfferPdfTemplateCode.PRISM);
            expect(input.palette).toBe('garant');
            expect(input.documentNumber).toBe('КП-1042');
            expect(input.settings).toBe(dto.settings);
            expect(input.letter).toBe(dto.letter);
            // «про сделку» остаётся от запроса
            expect(input.domain).toBe('test.bitrix24.ru');
            expect(input.dealId).toBe('100');
            expect(input).not.toHaveProperty('variants');
            expect(input).not.toHaveProperty('composition');
        }
    });

    it('independent + separateDocuments — флаг отдельных файлов в плане', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
                composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT, {
                    separateDocuments: true,
                }),
            }),
        );

        expect(plan.mode).toBe('independent');
        expect(plan.separateDocuments).toBe(true);
        expect(plan.units).toHaveLength(2);
    });

    it('запрос не меняется: варианты и верхние поля остаются как пришли', () => {
        const dto = pdfRequestOf({
            variants: [variantOf('Юрист', 11), variantOf('Бухгалтер', 12)],
            composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT),
            sets: Object.assign(pdfRequestOf().sets, {
                general: [garantSet(garantRow('Верх', 'Интернет'))],
            }),
        });
        const before = structuredClone(dto);

        planOfferPdfPrint(dto);

        expect(dto).toEqual(before);
    });
});
