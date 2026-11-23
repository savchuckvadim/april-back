import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import { COMPLECT_VARIANT_STAGE } from '@lib/portal-lib/pbx/pbx-complect-variant-smart';
import { ComplectVariantLifecycleService } from './complect-variant-lifecycle.service';

/** Участник документа: нужен только элемент смарта «Варианты комплекта». */
export interface OfferStageVariant {
    variantSmartId?: number | null;
}

/**
 * Стадия `cvar_offer` участникам КП (README lifecycle, п.1): точка одна —
 * генерация КП, она знает итоговый состав. Общая для PDF-КП; Word-КП v2
 * ставит ту же стадию тем же вызовом у себя в use-case.
 *
 * Best-effort: сбой стадий не ломает КП, оно уже сохранено. Стадия ставится
 * только вперёд: договор обратно в КП не уходит.
 */
@Injectable()
export class ComplectVariantOfferStageService {
    private readonly logger = new Logger(ComplectVariantOfferStageService.name);

    constructor(private readonly pbx: PBXService) {}

    async markOffer(
        domain: string,
        variants: readonly OfferStageVariant[] | null | undefined,
    ): Promise<void> {
        const ids = (variants ?? [])
            .map(variant => Number(variant.variantSmartId))
            .filter(id => Number.isFinite(id) && id > 0);
        if (!ids.length) return;
        try {
            const { bitrix, PortalModel } = await this.pbx.init(domain);
            const lifecycle = new ComplectVariantLifecycleService(
                bitrix,
                PortalModel,
            );
            await lifecycle.markStageForward(
                domain,
                ids,
                COMPLECT_VARIANT_STAGE.OFFER,
            );
        } catch (error) {
            this.logger.warn(
                `${domain}: стадия КП вариантам не проставлена: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }
}
