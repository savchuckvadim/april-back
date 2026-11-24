import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { findSalesBaseStage } from '../../../sales-hooks/lead-to-work/lib/xo-takeover-notice';
import { composeStageId } from '../../../event-report/services/deal/deal-target-stage.calculator';
import { EVENT_DOCUMENT_WRITE_CMD } from '../../constants/event-document-flow.const';
import { EventDocumentContext } from '../context/event-document.context';
import {
    EventDocumentEntityFields,
    EventDocumentEntityFieldsModel,
} from '../entity/event-document-entity-fields.model';
import { resolveDocumentStageMove } from './document-target-stage.calculator';

/**
 * «ОП Основная» по событию «документ сформирован»: поля карточки и стадия
 * одной командой.
 *
 * В отличие от `SalesBaseDealService` отчёта о звонке сделку не создаёт и
 * ответственного не меняет: документ формируют по уже существующей сделке.
 */
export class DocumentBaseDealService {
    private readonly logger = new Logger(DocumentBaseDealService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    queue(ctx: EventDocumentContext, buffer: IBatchGroupBuffer): void {
        const fields: EventDocumentEntityFields = {
            ...new EventDocumentEntityFieldsModel(
                ctx,
                'deal',
                ctx.baseDeal,
            ).toFields(),
            ...this.stageFields(ctx),
        };
        if (!Object.keys(fields).length) return;
        buffer.queue(() =>
            this.bitrix.batch.deal.update(
                EVENT_DOCUMENT_WRITE_CMD.baseDeal,
                ctx.baseDealId,
                fields,
            ),
        );
    }

    /** Новая стадия, если документ двигает сделку вперёд; иначе пусто. */
    private stageFields(ctx: EventDocumentContext): EventDocumentEntityFields {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (
            !category ||
            String(ctx.baseDeal.CATEGORY_ID) !== String(category.bitrixId)
        ) {
            this.logger.warn(
                `[document-flow] ${ctx.domain}: сделка ${ctx.baseDealId} не в воронке ` +
                    '«ОП Основная» — стадия не меняется',
            );
            return {};
        }
        const current = findSalesBaseStage(
            category.stages,
            ctx.baseDeal.STAGE_ID,
        );
        const targetCode = resolveDocumentStageMove(
            current?.code ?? null,
            ctx.kinds,
        );
        if (!targetCode) return {};
        const target = category.stages.find(stage => stage.code === targetCode);
        if (!target) {
            this.logger.warn(
                `[document-flow] ${ctx.domain}: стадия ${targetCode} не установлена ` +
                    'в воронке «ОП Основная» — сделка не передвинута',
            );
            return {};
        }
        return { STAGE_ID: composeStageId(category.bitrixId, target.bitrixId) };
    }
}
