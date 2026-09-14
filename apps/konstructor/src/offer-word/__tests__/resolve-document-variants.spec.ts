import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { ComplectCompositionDto } from '@app/konstructor/modules/inner-deal/dto/complect-composition.dto';
import { OfferWordMultiGenerateDto } from '../multi/dto/offer-word-multi-generate.dto';
import {
    resolveDocumentVariants,
    variantFromDto,
} from '../multi/lib/variants/resolve-document-variants';

/**
 * Режим печати — развилка всей генерации v2: от него зависит, сколько
 * рендеров и склеек будет. Ошибка здесь тихо меняет вид документа.
 */
const variant = (
    title: string,
    contractType: CONTRACT_LTYPE = CONTRACT_LTYPE.ABON,
): DocumentVariantDto =>
    ({
        variantSmartId: 1,
        title,
        contractType,
        complect: [],
        rows: [],
        sets: { general: [], alternative: [] },
        total: { name: title },
    }) as unknown as DocumentVariantDto;

const composition = (
    mode: ComplectModeEnum,
    offer: Partial<ComplectCompositionDto['offer']> = {},
): ComplectCompositionDto => ({
    mode,
    offer: {
        infoblocks: ComplectOfferInfoblocksEnum.INDEPENDENT,
        showAlternatives: false,
        ...offer,
    },
    openVariantSmartId: null,
});

const dto = (
    over: Partial<OfferWordMultiGenerateDto>,
): OfferWordMultiGenerateDto =>
    ({
        contractType: CONTRACT_LTYPE.LIC,
        complect: [{ groupsName: 'Право' }],
        contract: { id: 7 },
        supply: { id: 9 },
        rows: [{ name: 'строка запроса' }],
        sets: { general: [], alternative: [] },
        total: { name: 'Итого запроса' },
        variants: [],
        ...over,
    }) as unknown as OfferWordMultiGenerateDto;

describe('resolveDocumentVariants', () => {
    it('без участников — single из полей самого запроса, как старый фронт', () => {
        const request = dto({});
        const resolved = resolveDocumentVariants(request);

        expect(resolved.mode).toBe('single');
        expect(resolved.variants).toEqual([variantFromDto(request)]);
        expect(resolved.variants[0].contractType).toBe(CONTRACT_LTYPE.LIC);
        expect(resolved.variants[0].title).toBe('Итого запроса');
        expect(resolved.variants[0].variantSmartId).toBeNull();
    });

    it('один участник — single, участник берётся как есть', () => {
        const only = variant('Юрист');
        const resolved = resolveDocumentVariants(
            dto({
                variants: [only],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(resolved.mode).toBe('single');
        expect(resolved.variants).toEqual([only]);
    });

    it('несколько участников без настроек сборки — compare: вид документа не меняется', () => {
        const resolved = resolveDocumentVariants(
            dto({ variants: [variant('a'), variant('b')] }),
        );

        expect(resolved.mode).toBe('compare');
        expect(resolved.showAlternatives).toBe(false);
    });

    it('compare с показом альтернатив — флаг пробрасывается', () => {
        const resolved = resolveDocumentVariants(
            dto({
                variants: [variant('a'), variant('b')],
                composition: composition(ComplectModeEnum.COMPARE, {
                    showAlternatives: true,
                }),
            }),
        );

        expect(resolved.mode).toBe('compare');
        expect(resolved.showAlternatives).toBe(true);
    });

    it('multi_contract с independent-инфоблоками — independent', () => {
        const resolved = resolveDocumentVariants(
            dto({
                variants: [variant('a'), variant('b', CONTRACT_LTYPE.LIC)],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT),
            }),
        );

        expect(resolved.mode).toBe('independent');
        expect(resolved.separateDocuments).toBe(false);
    });

    it('single_contract с merged-инфоблоками — merged', () => {
        const resolved = resolveDocumentVariants(
            dto({
                variants: [variant('a'), variant('b')],
                composition: composition(ComplectModeEnum.SINGLE_CONTRACT, {
                    infoblocks: ComplectOfferInfoblocksEnum.MERGED,
                }),
            }),
        );

        expect(resolved.mode).toBe('merged');
    });

    it('separateDocuments читается из настроек КП', () => {
        const resolved = resolveDocumentVariants(
            dto({
                variants: [variant('a'), variant('b')],
                composition: composition(ComplectModeEnum.MULTI_CONTRACT, {
                    separateDocuments: true,
                }),
            }),
        );

        expect(resolved.mode).toBe('independent');
        expect(resolved.separateDocuments).toBe(true);
    });
});
