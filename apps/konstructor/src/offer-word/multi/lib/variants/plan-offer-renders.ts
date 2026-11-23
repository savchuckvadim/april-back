import { OfferWordByTemplateGenerateDto } from '../../../dto/offer-word-generate-request.dto';
import { mergeDocumentVariants } from './merge-document-variants';
import {
    DocumentVariantsRequest,
    ResolvedDocumentVariants,
} from './resolve-document-variants';
import { withComparisonSets } from './with-comparison-sets';
import { withVariant } from './with-variant';

/**
 * Запрос КП с участниками: поля сделки старого DTO плюс `variants` и
 * `composition`. Под него подходят запрос формирования КП v2 и запрос превью.
 */
export type OfferRenderRequest = OfferWordByTemplateGenerateDto &
    DocumentVariantsRequest;

/** Что и сколько раз рендерить для найденного режима печати. */
export interface OfferRenderPlan {
    /**
     * Запросы на рендер КП в порядке печати. Участники в них уже подставлены,
     * `variants` и `composition` отсутствуют: core-сервисы печатают одного
     * участника.
     */
    requests: OfferWordByTemplateGenerateDto[];
    /**
     * true — режим independent: по запросу на каждого участника, у каждого
     * своя страница. PDF этих запросов вызывающий склеивает в один документ
     * либо отдаёт по одному. false — запрос один.
     */
    perVariant: boolean;
    /** Что не сошлось при слиянии участников (сроки, скидки). */
    warnings: string[];
}

/**
 * Режим печати → список запросов на рендер. Чистая функция: единая точка,
 * по которой идут и формирование КП, и превью, поэтому превью печатает то
 * же, что получит менеджер.
 *
 * single — участник один (или ни одного: тогда поля самого запроса);
 * compare — открытый участник, наборы остальных идут в «для сравнения» по
 * флагу показа; merged — один слитый участник; independent — по запросу на
 * участника.
 */
export const planOfferRenders = (
    dto: OfferRenderRequest,
    resolved: ResolvedDocumentVariants,
): OfferRenderPlan => {
    switch (resolved.mode) {
        case 'merged': {
            const merged = mergeDocumentVariants(resolved.variants);
            return {
                requests: [withVariant(dto, merged.variant)],
                perVariant: false,
                warnings: merged.warnings,
            };
        }
        case 'independent':
            return {
                requests: resolved.variants.map(variant =>
                    withVariant(dto, variant),
                ),
                perVariant: true,
                warnings: [],
            };
        case 'compare':
            return {
                requests: [
                    withVariant(
                        dto,
                        withComparisonSets(
                            resolved.variants,
                            resolved.showAlternatives,
                        ),
                    ),
                ],
                perVariant: false,
                warnings: [],
            };
        default:
            return {
                requests: [withVariant(dto, resolved.variants[0])],
                perVariant: false,
                warnings: [],
            };
    }
};
