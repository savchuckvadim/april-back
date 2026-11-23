import {
    OfferComplectSectionDto,
    OfferComplectsModeEnum,
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
 * Комплекты со своим наполнением и вид их печати идут от участника в каждый
 * печатаемый документ PDF-КП. Режимы печати участников работают как раньше.
 */
const section = (title: string): OfferComplectSectionDto =>
    Object.assign(new OfferComplectSectionDto(), { title, complect: [] });

const titles = (
    sections: OfferComplectSectionDto[] | undefined,
): string[] | undefined => sections?.map(item => item.title);

const variantWith = (
    title: string,
    count: number,
    complectsMode?: OfferComplectsModeEnum,
): DocumentVariantDto =>
    Object.assign(variantOf(title, 1), {
        complects: Array.from({ length: count }, (_item, index) =>
            section(`${title}: ${index + 1}`),
        ),
        ...(complectsMode ? { complectsMode } : {}),
    });

describe('план печати PDF-КП: комплекты со своим наполнением', () => {
    it('без вариантов — комплекты и режим из полей запроса попадают в документ', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                complects: [section('Бухгалтерия'), section('Юрист')],
                complectsMode: OfferComplectsModeEnum.SEPARATE,
            }),
        );

        expect(plan.units).toHaveLength(1);
        expect(titles(plan.units[0].input.complects)).toEqual([
            'Бухгалтерия',
            'Юрист',
        ]);
        expect(plan.units[0].input.complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });

    it('запрос без комплектов печатается как раньше: полей у документа нет', () => {
        const plan = planOfferPdfPrint(pdfRequestOf());

        expect(plan.units[0].input.complects).toBeUndefined();
        expect(plan.units[0].input.complectsMode).toBeUndefined();
    });

    it('один вариант — комплекты варианта, верхние поля запроса не примешиваются', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                complects: [section('Из запроса')],
                complectsMode: OfferComplectsModeEnum.MERGED,
                variants: [
                    variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
                ],
            }),
        );

        expect(titles(plan.units[0].input.complects)).toEqual([
            'Юрист: 1',
            'Юрист: 2',
        ]);
        expect(plan.units[0].input.complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });

    it('independent — у каждого документа комплекты и режим своего варианта', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
                    variantWith('Бухгалтер', 1, OfferComplectsModeEnum.MERGED),
                    variantOf('Кадровик', 3),
                ],
                composition: compositionOf(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(plan.mode).toBe('independent');
        expect(plan.units.map(unit => titles(unit.input.complects))).toEqual([
            ['Юрист: 1', 'Юрист: 2'],
            ['Бухгалтер: 1'],
            undefined,
        ]);
        expect(plan.units.map(unit => unit.input.complectsMode)).toEqual([
            OfferComplectsModeEnum.SEPARATE,
            OfferComplectsModeEnum.MERGED,
            undefined,
        ]);
    });

    it('merged — один документ: комплекты вариантов подряд, режим от первого варианта', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantWith('Юрист', 1, OfferComplectsModeEnum.SEPARATE),
                    variantWith('Бухгалтер', 2, OfferComplectsModeEnum.MERGED),
                ],
                composition: compositionOf(ComplectModeEnum.SINGLE_CONTRACT, {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                }),
            }),
        );

        expect(plan.mode).toBe('merged');
        expect(plan.units).toHaveLength(1);
        expect(titles(plan.units[0].input.complects)).toEqual([
            'Юрист: 1',
            'Бухгалтер: 1',
            'Бухгалтер: 2',
        ]);
        expect(plan.units[0].input.complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });

    it('compare — комплекты открытого варианта', () => {
        const plan = planOfferPdfPrint(
            pdfRequestOf({
                variants: [
                    variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
                    variantWith('Бухгалтер', 2),
                ],
                composition: compositionOf(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            }),
        );

        expect(plan.mode).toBe('compare');
        expect(titles(plan.units[0].input.complects)).toEqual([
            'Юрист: 1',
            'Юрист: 2',
        ]);
        expect(plan.units[0].input.complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });
});
