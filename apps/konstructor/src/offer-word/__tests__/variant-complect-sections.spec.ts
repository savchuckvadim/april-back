import {
    OfferComplectSectionDto,
    OfferComplectsModeEnum,
} from '@app/konstructor/document-generate';
import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { mergeDocumentVariants } from '../multi/lib/variants/merge-document-variants';
import { planOfferRenders } from '../multi/lib/variants/plan-offer-renders';
import {
    resolveDocumentVariants,
    variantFromDto,
} from '../multi/lib/variants/resolve-document-variants';
import { withVariant } from '../multi/lib/variants/with-variant';
import {
    previewComposition,
    previewRequest,
    previewVariant,
} from './offer-word-preview.fixtures';

/**
 * Комплекты со своим наполнением (`complects`) и вид их печати
 * (`complectsMode`) — «про комплект»: берутся от участника.
 * Режимы печати участников работают как раньше.
 */
const section = (title: string): OfferComplectSectionDto =>
    Object.assign(new OfferComplectSectionDto(), { title, complect: [] });

const titles = (
    sections: OfferComplectSectionDto[] | undefined,
): string[] | undefined => sections?.map(item => item.title);

/** Участник с комплектами: название комплекта — «<участник>: <номер>». */
const variantWith = (
    title: string,
    count: number,
    complectsMode?: OfferComplectsModeEnum,
    contractType: CONTRACT_LTYPE = CONTRACT_LTYPE.ABON,
): DocumentVariantDto =>
    Object.assign(previewVariant(title, contractType), {
        complects: Array.from({ length: count }, (_item, index) =>
            section(`${title}: ${index + 1}`),
        ),
        ...(complectsMode ? { complectsMode } : {}),
    });

describe('withVariant: комплекты участника', () => {
    it('переносит complects и complectsMode участника в запрос', () => {
        const dto = previewRequest({});
        const variant = variantWith(
            'Юрист',
            2,
            OfferComplectsModeEnum.SEPARATE,
        );

        const request = withVariant(dto, variant);

        expect(request.complects).toBe(variant.complects);
        expect(request.complectsMode).toBe(OfferComplectsModeEnum.SEPARATE);
    });

    it('у участника комплектов нет — они не берутся из запроса: наполнение одного участника не попадает в документ другого', () => {
        const dto = previewRequest({
            complects: [section('Из запроса')],
            complectsMode: OfferComplectsModeEnum.SEPARATE,
        });

        const request = withVariant(
            dto,
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
        );

        expect(request).not.toHaveProperty('complects');
        expect(request).not.toHaveProperty('complectsMode');
    });

    it('исходный запрос и участник не меняются', () => {
        const dto = previewRequest({
            complects: [section('Из запроса')],
            complectsMode: OfferComplectsModeEnum.MERGED,
        });
        const variant = variantWith(
            'Юрист',
            2,
            OfferComplectsModeEnum.SEPARATE,
        );

        withVariant(dto, variant);

        expect(titles(dto.complects)).toEqual(['Из запроса']);
        expect(dto.complectsMode).toBe(OfferComplectsModeEnum.MERGED);
        expect(titles(variant.complects)).toEqual(['Юрист: 1', 'Юрист: 2']);
    });

    it('запрос и участник без комплектов: поля не появляются', () => {
        const request = withVariant(
            previewRequest({}),
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
        );

        expect(request).not.toHaveProperty('complects');
        expect(request).not.toHaveProperty('complectsMode');
    });
});

describe('variantFromDto: комплекты одиночного запроса', () => {
    it('верхние complects и complectsMode запроса становятся полями участника', () => {
        const dto = previewRequest({
            complects: [section('Бухгалтерия'), section('Юрист')],
            complectsMode: OfferComplectsModeEnum.SEPARATE,
        });

        const variant = variantFromDto(dto);

        expect(variant.complects).toBe(dto.complects);
        expect(variant.complectsMode).toBe(OfferComplectsModeEnum.SEPARATE);
    });

    it('запрос без комплектов — участник без этих полей', () => {
        const variant = variantFromDto(previewRequest({}));

        expect(variant).not.toHaveProperty('complects');
        expect(variant).not.toHaveProperty('complectsMode');
    });
});

describe('mergeDocumentVariants: комплекты участников', () => {
    it('complects — списки участников подряд, complectsMode — от первого', () => {
        const { variant } = mergeDocumentVariants([
            variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
            variantWith('Бухгалтер', 1, OfferComplectsModeEnum.MERGED),
            variantWith('Кадровик', 2),
        ]);

        expect(titles(variant.complects)).toEqual([
            'Юрист: 1',
            'Юрист: 2',
            'Бухгалтер: 1',
            'Кадровик: 1',
            'Кадровик: 2',
        ]);
        expect(variant.complectsMode).toBe(OfferComplectsModeEnum.SEPARATE);
    });

    it('у первого участника комплектов нет — берутся комплекты остальных, режим от первого', () => {
        const { variant } = mergeDocumentVariants([
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
            variantWith('Бухгалтер', 2, OfferComplectsModeEnum.SEPARATE),
        ]);

        expect(titles(variant.complects)).toEqual([
            'Бухгалтер: 1',
            'Бухгалтер: 2',
        ]);
        expect(variant.complectsMode).toBeUndefined();
    });

    it('ни у кого комплектов нет — у слитого участника их тоже нет', () => {
        const { variant } = mergeDocumentVariants([
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
            previewVariant('Бухгалтер', CONTRACT_LTYPE.ABON),
        ]);

        // экземпляр DTO хранит необъявленные поля как undefined
        expect(variant.complects).toBeUndefined();
        expect(variant.complectsMode).toBeUndefined();
    });

    it('один участник возвращается как есть', () => {
        const only = variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE);

        expect(mergeDocumentVariants([only]).variant).toBe(only);
    });

    it('исходные участники не меняются', () => {
        const first = variantWith('Юрист', 1, OfferComplectsModeEnum.SEPARATE);
        const second = variantWith('Бухгалтер', 1);

        mergeDocumentVariants([first, second]);

        expect(titles(first.complects)).toEqual(['Юрист: 1']);
        expect(titles(second.complects)).toEqual(['Бухгалтер: 1']);
    });
});

describe('planOfferRenders: комплекты в режимах печати участников', () => {
    const planOf = (over: Parameters<typeof previewRequest>[0]) => {
        const dto = previewRequest(over);
        return planOfferRenders(dto, resolveDocumentVariants(dto));
    };

    it('single без участников — комплекты и режим из верхних полей запроса', () => {
        const plan = planOf({
            complects: [section('Бухгалтерия'), section('Юрист')],
            complectsMode: OfferComplectsModeEnum.SEPARATE,
        });

        expect(plan.requests).toHaveLength(1);
        expect(titles(plan.requests[0].complects)).toEqual([
            'Бухгалтерия',
            'Юрист',
        ]);
        expect(plan.requests[0].complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });

    it('single с одним участником — комплекты участника, верхние поля запроса не мешают', () => {
        const plan = planOf({
            complects: [section('Из запроса')],
            variants: [
                variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
            ],
        });

        expect(titles(plan.requests[0].complects)).toEqual([
            'Юрист: 1',
            'Юрист: 2',
        ]);
        expect(plan.requests[0].complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });

    it('compare — комплекты открытого участника, остальные не печатаются', () => {
        const plan = planOf({
            variants: [
                variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
                variantWith('Бухгалтер', 2, OfferComplectsModeEnum.MERGED),
            ],
            composition: previewComposition(ComplectModeEnum.COMPARE, {
                showAlternatives: true,
            }),
        });

        expect(plan.requests).toHaveLength(1);
        expect(titles(plan.requests[0].complects)).toEqual([
            'Юрист: 1',
            'Юрист: 2',
        ]);
        expect(plan.requests[0].complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
        expect(plan.requests[0].sets.alternative).toHaveLength(1);
    });

    it('merged — один запрос: комплекты участников подряд, режим от первого', () => {
        const plan = planOf({
            variants: [
                variantWith('Юрист', 1, OfferComplectsModeEnum.SEPARATE),
                variantWith('Бухгалтер', 2),
            ],
            composition: previewComposition(ComplectModeEnum.SINGLE_CONTRACT, {
                infoblocks: ComplectOfferInfoblocksEnum.MERGED,
            }),
        });

        expect(plan.requests).toHaveLength(1);
        expect(titles(plan.requests[0].complects)).toEqual([
            'Юрист: 1',
            'Бухгалтер: 1',
            'Бухгалтер: 2',
        ]);
        expect(plan.requests[0].complectsMode).toBe(
            OfferComplectsModeEnum.SEPARATE,
        );
    });

    it('independent — у каждого запроса комплекты и режим своего участника', () => {
        const plan = planOf({
            variants: [
                variantWith('Юрист', 2, OfferComplectsModeEnum.SEPARATE),
                variantWith('Бухгалтер', 1, OfferComplectsModeEnum.MERGED),
                previewVariant('Кадровик', CONTRACT_LTYPE.ABON),
            ],
            composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT),
        });

        expect(plan.requests.map(request => titles(request.complects))).toEqual(
            [['Юрист: 1', 'Юрист: 2'], ['Бухгалтер: 1'], undefined],
        );
        expect(plan.requests.map(request => request.complectsMode)).toEqual([
            OfferComplectsModeEnum.SEPARATE,
            OfferComplectsModeEnum.MERGED,
            undefined,
        ]);
    });
});
