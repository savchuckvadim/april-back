import {
    OfferAlternativeSetComplectsDto,
    OfferComplectSectionDto,
} from '@app/konstructor/document-generate';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { planOfferPdfPrint } from '../lib/offer-pdf-print-plan';
import {
    compositionOf,
    pdfRequestOf,
    variantOf,
} from './fixtures/offer-pdf-variants.fixture';

/**
 * Наполнение наборов для сравнения идёт от участника в каждый печатаемый
 * документ PDF-КП. Наборы разных участников не объединяются. Режимы печати
 * участников работают как раньше.
 */
const alternativeSet = (
    setNumber: number,
    title = `Набор ${setNumber}`,
): OfferAlternativeSetComplectsDto =>
    Object.assign(new OfferAlternativeSetComplectsDto(), {
        setNumber,
        title,
        complects: [
            Object.assign(new OfferComplectSectionDto(), {
                title: `Комплект набора ${setNumber}`,
                complect: [],
            }),
        ],
    });

const numbers = (
    sets: OfferAlternativeSetComplectsDto[] | undefined,
): number[] | undefined => sets?.map(item => item.setNumber);

const variantWith = (title: string, count: number): DocumentVariantDto =>
    Object.assign(variantOf(title, 1), {
        alternativeComplects: Array.from({ length: count }, (_item, index) =>
            alternativeSet(index + 1),
        ),
    });

describe('план печати PDF-КП: наполнение наборов для сравнения', () => {
    it('без вариантов — наборы из поля запроса попадают в документ', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                alternativeComplects: [alternativeSet(1), alternativeSet(2)],
            }),
        );

        expect(plan.units).toHaveLength(1);
        expect(numbers(plan.units[0].input.alternativeComplects)).toEqual([
            1, 2,
        ]);
    });

    it('запрос без наборов печатается как раньше: поля у документа нет', () => {
        const plan = planOfferPdfPrint(pdfRequestOf());

        expect(plan.units[0].input.alternativeComplects).toBeUndefined();
    });

    it('один вариант — наборы варианта, верхнее поле запроса не примешивается', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                alternativeComplects: [alternativeSet(9)],
                variants: [variantWith('Юрист', 2)],
            }),
        );

        expect(numbers(plan.units[0].input.alternativeComplects)).toEqual([
            1, 2,
        ]);
    });

    it('independent — у каждого документа наборы своего варианта', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantWith('Юрист', 2),
                    variantWith('Бухгалтер', 1),
                    variantOf('Кадровик', 3),
                ],
                composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(plan.mode).toBe('independent');
        expect(
            plan.units.map(unit => numbers(unit.input.alternativeComplects)),
        ).toEqual([[1, 2], [1], undefined]);
    });

    it('merged — один документ с наборами первого варианта, наборы остальных не объединяются', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantWith('Юрист', 1),
                    variantWith('Бухгалтер', 2),
                ],
                composition: compositionOf(ComplectModeEnum.SINGLE_CONTRACT, {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                }),
            }),
        );

        expect(plan.mode).toBe('merged');
        expect(plan.units).toHaveLength(1);
        expect(numbers(plan.units[0].input.alternativeComplects)).toEqual([1]);
    });

    it('compare — наборы открытого варианта', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantWith('Юрист', 2),
                    variantWith('Бухгалтер', 3),
                ],
                composition: compositionOf(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            }),
        );

        expect(plan.mode).toBe('compare');
        expect(numbers(plan.units[0].input.alternativeComplects)).toEqual([
            1, 2,
        ]);
    });
});
