import { DocumentVariantDto } from '@app/konstructor/document-generate/dto/document-variant/document-variant.dto';
import { OfferWordByTemplateGenerateDto } from '../../../dto/offer-word-generate-request.dto';
import { OfferWordMultiGenerateDto } from '../../dto/offer-word-multi-generate.dto';

/**
 * Payload одиночного рендера с данными одного участника. Всё «про сделку»
 * (шаблон, получатель, менеджер, счета) остаётся от запроса, всё «про
 * комплект» — от участника. Сам запрос не мутируется.
 *
 * Возвращается старый DTO: core-сервисы печатают одного участника и про
 * мультивариантность не знают — участники и настройки сборки дальше не идут.
 */
export const withVariant = (
    dto: OfferWordMultiGenerateDto,
    variant: DocumentVariantDto,
): OfferWordByTemplateGenerateDto => {
    const base: Partial<OfferWordMultiGenerateDto> = { ...dto };
    delete base.composition;
    delete base.variants;

    return {
        ...(base as OfferWordByTemplateGenerateDto),
        contractType: variant.contractType,
        complect: variant.complect,
        contract: variant.contract,
        supply: variant.supply,
        rows: variant.rows,
        sets: variant.sets,
        total: variant.total,
    };
};

/**
 * Группы участников по типу договора — по группе на договор и на счёт.
 * Порядок групп — порядок первого появления типа.
 */
export const groupVariantsByContractType = (
    variants: readonly DocumentVariantDto[],
): DocumentVariantDto[][] => {
    const groups = new Map<string, DocumentVariantDto[]>();
    for (const variant of variants) {
        const key = String(variant.contractType);
        const group = groups.get(key);
        if (group) {
            group.push(variant);
        } else {
            groups.set(key, [variant]);
        }
    }
    return [...groups.values()];
};
