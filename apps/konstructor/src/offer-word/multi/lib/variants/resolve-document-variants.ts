import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import {
    ComplectModeEnum,
    ComplectOfferInfoblocksEnum,
} from '@app/konstructor/modules/inner-deal/type/complect-composition.type';
import { OfferWordMultiGenerateDto } from '../../dto/offer-word-multi-generate.dto';

/** Как печатать участников. */
export type DocumentVariantsMode =
    | 'single'
    | 'compare'
    | 'independent'
    | 'merged';

export interface ResolvedDocumentVariants {
    mode: DocumentVariantsMode;
    variants: DocumentVariantDto[];
    /** Показывать в КП наборы «для сравнения» остальных участников. */
    showAlternatives: boolean;
    /** independent: по документу на участника, PDF не склеиваются. */
    separateDocuments: boolean;
}

/**
 * Одиночный документ как участник: поля сегодняшнего payload и есть первый
 * (или единственный) вариант — так старый фронт и один набор идут одним кодом.
 */
export const variantFromDto = (
    dto: OfferWordMultiGenerateDto,
): DocumentVariantDto => ({
    variantSmartId: null,
    title: dto.total?.name ?? '',
    contractType: dto.contractType,
    complect: dto.complect,
    contract: dto.contract,
    supply: dto.supply,
    rows: dto.rows,
    sets: dto.sets,
    total: dto.total,
});

/**
 * Кого и как печатать.
 *
 * Нет `variants` или участник один — `single`: бэк работает как раньше.
 * Иначе режим берётся из настроек сборки; без настроек — `compare`, потому
 * что это единственный режим, который не меняет вид документа.
 */
export const resolveDocumentVariants = (
    dto: OfferWordMultiGenerateDto,
): ResolvedDocumentVariants => {
    const variants = dto.variants ?? [];
    const showAlternatives = Boolean(dto.composition?.offer?.showAlternatives);
    const separateDocuments = Boolean(
        dto.composition?.offer?.separateDocuments,
    );

    if (variants.length === 0) {
        return {
            mode: 'single',
            variants: [variantFromDto(dto)],
            showAlternatives,
            separateDocuments,
        };
    }
    if (variants.length === 1) {
        return {
            mode: 'single',
            variants,
            showAlternatives,
            separateDocuments,
        };
    }

    const mode = dto.composition?.mode ?? ComplectModeEnum.COMPARE;
    if (mode === ComplectModeEnum.COMPARE) {
        return {
            mode: 'compare',
            variants,
            showAlternatives,
            separateDocuments,
        };
    }

    const infoblocks = dto.composition?.offer?.infoblocks;
    return {
        mode:
            infoblocks === ComplectOfferInfoblocksEnum.MERGED
                ? 'merged'
                : 'independent',
        variants,
        showAlternatives,
        separateDocuments,
    };
};
