import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { planOfferRenders } from '../multi/lib/variants/plan-offer-renders';
import { resolveDocumentVariants } from '../multi/lib/variants/resolve-document-variants';
import {
    previewComposition,
    previewRequest,
    previewVariant,
} from './offer-word-preview.fixtures';

/**
 * Режим → запросы на рендер: единый путь формирования КП и превью. Поведение
 * формирования закрепляют тесты OfferWordMultiBuildService, здесь — сам план.
 */
const planOf = (over: Parameters<typeof previewRequest>[0]) => {
    const dto = previewRequest(over);
    return planOfferRenders(dto, resolveDocumentVariants(dto));
};

const lawyer = () => previewVariant('Юрист', CONTRACT_LTYPE.ABON, 100);
const accountant = () => previewVariant('Бухгалтер', CONTRACT_LTYPE.LIC, 200);

describe('planOfferRenders', () => {
    it('без участников — один запрос из верхних полей', () => {
        const plan = planOf({});

        expect(plan.perVariant).toBe(false);
        expect(plan.warnings).toEqual([]);
        expect(plan.requests).toHaveLength(1);
        expect(plan.requests[0].total.name).toBe('Итого запроса');
        expect(plan.requests[0].contractType).toBe(CONTRACT_LTYPE.LIC);
    });

    it('один участник — один запрос с его данными', () => {
        const plan = planOf({
            variants: [lawyer()],
            composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT),
        });

        expect(plan.perVariant).toBe(false);
        expect(plan.requests).toHaveLength(1);
        expect(plan.requests[0].total.name).toBe('Итого Юрист');
        expect(plan.requests[0].contractType).toBe(CONTRACT_LTYPE.ABON);
    });

    it('compare — один запрос открытого участника, наборы остальных идут «для сравнения» по флагу', () => {
        const shown = planOf({
            variants: [lawyer(), accountant()],
            composition: previewComposition(ComplectModeEnum.COMPARE, {
                showAlternatives: true,
            }),
        });
        const hidden = planOf({
            variants: [lawyer(), accountant()],
            composition: previewComposition(ComplectModeEnum.COMPARE),
        });

        expect(shown.requests).toHaveLength(1);
        expect(shown.requests[0].total.name).toBe('Итого Юрист');
        expect(shown.requests[0].sets.alternative).toHaveLength(1);
        expect(hidden.requests[0].sets.alternative).toEqual([]);
        expect(shown.perVariant).toBe(false);
    });

    it('merged — один запрос слитого участника, расхождения сроков в warnings', () => {
        const plan = planOf({
            variants: [
                lawyer(),
                previewVariant(
                    'Бухгалтер',
                    CONTRACT_LTYPE.ABON,
                    200,
                    undefined,
                    6,
                ),
            ],
            composition: previewComposition(ComplectModeEnum.SINGLE_CONTRACT, {
                infoblocks: ComplectOfferInfoblocksEnum.MERGED,
            }),
        });

        expect(plan.perVariant).toBe(false);
        expect(plan.requests).toHaveLength(1);
        expect(plan.requests[0].total.price.sum).toBe(300);
        expect(plan.requests[0].rows).toHaveLength(2);
        expect(plan.warnings).toEqual([
            'срок набора «Итого Бухгалтер» (6) отличается от первого (12) — взят первый',
        ]);
    });

    it('independent — по запросу на участника в порядке участников', () => {
        const plan = planOf({
            variants: [lawyer(), accountant()],
            composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT),
        });

        expect(plan.perVariant).toBe(true);
        expect(plan.requests.map(request => request.total.name)).toEqual([
            'Итого Юрист',
            'Итого Бухгалтер',
        ]);
        expect(plan.requests.map(request => request.contractType)).toEqual([
            CONTRACT_LTYPE.ABON,
            CONTRACT_LTYPE.LIC,
        ]);
    });

    it('запросы плана без variants и composition, поля сделки остаются от запроса', () => {
        const plan = planOf({
            variants: [lawyer(), accountant()],
            composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT),
        });

        for (const request of plan.requests) {
            expect(request).not.toHaveProperty('variants');
            expect(request).not.toHaveProperty('composition');
            expect(request.domain).toBe('test.bitrix24.ru');
            expect(request.templateId).toBe('1');
        }
    });

    it('исходный запрос не меняется', () => {
        const dto = previewRequest({
            variants: [lawyer(), accountant()],
            composition: previewComposition(ComplectModeEnum.MULTI_CONTRACT),
        });

        planOfferRenders(dto, resolveDocumentVariants(dto));

        expect(dto.variants).toHaveLength(2);
        expect(dto.composition?.mode).toBe(ComplectModeEnum.MULTI_CONTRACT);
        expect(dto.total.name).toBe('Итого запроса');
    });
});
