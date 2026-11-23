import {
    OfferAlternativeSetComplectsDto,
    OfferComplectSectionDto,
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
 * Наполнение наборов для сравнения (`alternativeComplects`) — «про комплект»:
 * едет вместе с участником, как `complects`. Наборы разных участников не
 * объединяются. Режимы печати участников работают как раньше.
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

/** Участник с наборами для сравнения: номера наборов — с единицы */
const variantWith = (
    title: string,
    count: number,
    contractType: CONTRACT_LTYPE = CONTRACT_LTYPE.ABON,
): DocumentVariantDto =>
    Object.assign(previewVariant(title, contractType), {
        alternativeComplects: Array.from({ length: count }, (_item, index) =>
            alternativeSet(index + 1, `${title}: набор ${index + 1}`),
        ),
    });

describe('withVariant: наборы для сравнения участника', () => {
    it('переносит alternativeComplects участника в запрос', () => {
        const dto = previewRequest({});
        const variant = variantWith('Юрист', 2);

        const request = withVariant(dto, variant);

        expect(request.alternativeComplects).toBe(variant.alternativeComplects);
    });

    it('у участника наборов нет — они не берутся из запроса: наполнение одного участника не попадает в документ другого', () => {
        const dto = previewRequest({
            alternativeComplects: [alternativeSet(1, 'Из запроса')],
        });

        const request = withVariant(
            dto,
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
        );

        expect(request).not.toHaveProperty('alternativeComplects');
    });

    it('исходный запрос и участник не меняются', () => {
        const dto = previewRequest({
            alternativeComplects: [alternativeSet(1, 'Из запроса')],
        });
        const variant = variantWith('Юрист', 2);

        withVariant(dto, variant);

        expect(dto.alternativeComplects?.map(item => item.title)).toEqual([
            'Из запроса',
        ]);
        expect(numbers(variant.alternativeComplects)).toEqual([1, 2]);
    });

    it('запрос и участник без наборов: поле не появляется', () => {
        const request = withVariant(
            previewRequest({}),
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
        );

        expect(request).not.toHaveProperty('alternativeComplects');
    });

    it('наполнение общего набора и наборов для сравнения едут независимо', () => {
        const variant = Object.assign(variantWith('Юрист', 1), {
            complects: [
                Object.assign(new OfferComplectSectionDto(), {
                    title: 'Общий',
                    complect: [],
                }),
            ],
        });

        const request = withVariant(previewRequest({}), variant);

        expect(request.complects?.map(item => item.title)).toEqual(['Общий']);
        expect(numbers(request.alternativeComplects)).toEqual([1]);
    });
});

describe('variantFromDto: наборы для сравнения одиночного запроса', () => {
    it('верхний alternativeComplects запроса становится полем участника', () => {
        const dto = previewRequest({
            alternativeComplects: [alternativeSet(1), alternativeSet(2)],
        });

        const variant = variantFromDto(dto);

        expect(variant.alternativeComplects).toBe(dto.alternativeComplects);
    });

    it('запрос без наборов — участник без этого поля', () => {
        const variant = variantFromDto(previewRequest({}));

        expect(variant).not.toHaveProperty('alternativeComplects');
    });
});

describe('mergeDocumentVariants: наборы для сравнения участников не объединяются', () => {
    it('у слитого участника наборы первого: наборы остальных не добавляются и номера не склеиваются', () => {
        const first = variantWith('Юрист', 2);
        const { variant } = mergeDocumentVariants([
            first,
            variantWith('Бухгалтер', 3),
            variantWith('Кадровик', 1),
        ]);

        expect(variant.alternativeComplects).toBe(first.alternativeComplects);
        expect(numbers(variant.alternativeComplects)).toEqual([1, 2]);
        expect(variant.alternativeComplects?.map(item => item.title)).toEqual([
            'Юрист: набор 1',
            'Юрист: набор 2',
        ]);
    });

    it('у первого участника наборов нет — у слитого их тоже нет, наборы остальных не подтягиваются', () => {
        const { variant } = mergeDocumentVariants([
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
            variantWith('Бухгалтер', 2),
        ]);

        expect(variant.alternativeComplects).toBeUndefined();
    });

    it('ни у кого наборов нет — у слитого участника их тоже нет', () => {
        const { variant } = mergeDocumentVariants([
            previewVariant('Юрист', CONTRACT_LTYPE.ABON),
            previewVariant('Бухгалтер', CONTRACT_LTYPE.ABON),
        ]);

        expect(variant.alternativeComplects).toBeUndefined();
    });

    it('один участник возвращается как есть', () => {
        const only = variantWith('Юрист', 2);

        expect(mergeDocumentVariants([only]).variant).toBe(only);
    });

    it('исходные участники не меняются', () => {
        const first = variantWith('Юрист', 1);
        const second = variantWith('Бухгалтер', 2);

        mergeDocumentVariants([first, second]);

        expect(numbers(first.alternativeComplects)).toEqual([1]);
        expect(numbers(second.alternativeComplects)).toEqual([1, 2]);
    });
});

describe('planOfferRenders: наборы для сравнения в режимах печати участников', () => {
    const planOf = (over: Parameters<typeof previewRequest>[0]) => {
        const dto = previewRequest(over);
        return planOfferRenders(dto, resolveDocumentVariants(dto));
    };

    it('single без участников — наборы из верхнего поля запроса', () => {
        const plan = planOf({
            alternativeComplects: [alternativeSet(1), alternativeSet(2)],
        });

        expect(plan.requests).toHaveLength(1);
        expect(numbers(plan.requests[0].alternativeComplects)).toEqual([1, 2]);
    });

    it('single с одним участником — наборы участника, верхнее поле запроса не мешает', () => {
        const plan = planOf({
            alternativeComplects: [alternativeSet(7, 'Из запроса')],
            variants: [variantWith('Юрист', 2)],
        });

        expect(numbers(plan.requests[0].alternativeComplects)).toEqual([1, 2]);
    });

    it('compare — наборы открытого участника, наполнение остальных не печатается', () => {
        const plan = planOf({
            variants: [variantWith('Юрист', 2), variantWith('Бухгалтер', 3)],
            composition: previewComposition(ComplectModeEnum.COMPARE, {
                showAlternatives: true,
            }),
        });

        expect(plan.requests).toHaveLength(1);
        expect(numbers(plan.requests[0].alternativeComplects)).toEqual([1, 2]);
        expect(plan.requests[0].sets.alternative).toHaveLength(1);
    });

    it('merged — один запрос с наборами первого участника', () => {
        const plan = planOf({
            variants: [variantWith('Юрист', 1), variantWith('Бухгалтер', 2)],
            composition: previewComposition(ComplectModeEnum.SINGLE_CONTRACT, {
                infoblocks: ComplectOfferInfoblocksEnum.MERGED,
            }),
        });

        expect(plan.requests).toHaveLength(1);
        expect(numbers(plan.requests[0].alternativeComplects)).toEqual([1]);
    });

    it('independent — у каждого запроса наборы своего участника', () => {
        const plan = planOf({
            variants: [
                variantWith('Юрист', 2),
                variantWith('Бухгалтер', 1),
                previewVariant('Кадровик', CONTRACT_LTYPE.ABON),
            ],
            composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT),
        });

        expect(
            plan.requests.map(request => numbers(request.alternativeComplects)),
        ).toEqual([[1, 2], [1], undefined]);
    });
});
