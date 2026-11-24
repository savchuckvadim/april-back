import { Logger } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import {
    IBXListItem,
    IBXListItemFields,
} from '@/modules/bitrix/domain/list-item/interface/bx-list-item.interface';
import { IPBXList } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PBX_SALES_PRESENTATION_LIST_CODE,
    PBX_SALES_PRESENTATION_LIST_FIELD_CODES,
    PBX_SALES_PRESENTATION_LIST_ITEM_CODES,
    PbxSalesPresentationListFieldCode,
    salesPresentationListRowCode,
} from '@lib/portal-lib/pbx/pbx-sales-presentation-list/pbx-sales-presentation-list.const';
import { SALES_DOCUMENT_KIND } from '@lib/queue';
import { IBatchGroupBuffer } from '../../../shared/batch/batch-group-buffer.interface';
import { normalizeListValues } from '../../../shared/side-flow/side-flow-kpi-row-binder.service';
import {
    dealLinkKey,
    toLinkedDealId,
} from '../../../cold-hook-v2/lib/deal-link-fields';
import { EVENT_DOCUMENT_WRITE_CMD } from '../../constants/event-document-flow.const';
import { EventDocumentContext } from '../context/event-document.context';

const FIELD = PBX_SALES_PRESENTATION_LIST_FIELD_CODES;

/**
 * Старый список «Презентации»: в строку презентации дописываются сумма КП
 * или счёта и комментарий о документе.
 *
 * Строку список получает от легаси-хука при планировании презентации; здесь
 * она только обновляется. Нет списка или строки — ничего не создаём, как и
 * в легаси.
 *
 * `lists.element.update` перезаписывает элемент целиком, поэтому строка
 * сначала читается, и все её свойства уходят обратно вместе с новыми.
 */
export class EventDocumentPresentationListService {
    private readonly logger = new Logger(
        EventDocumentPresentationListService.name,
    );

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async queue(
        ctx: EventDocumentContext,
        buffer: IBatchGroupBuffer,
    ): Promise<void> {
        const titles = this.afterPresentationTitles(ctx);
        const presentationDealId = ctx.presentationDealId;
        if (!titles.length || !presentationDealId) return;

        const list = this.portal.getListByCode(
            PBX_SALES_PRESENTATION_LIST_CODE,
        );
        if (!list?.bitrixId) return;

        const code = this.rowCode(ctx, presentationDealId);
        const row = await this.readRow(list, code);
        if (!row) {
            this.logger.log(
                `[document-flow] ${ctx.domain}: строки презентации ${code} ` +
                    'в списке «Презентации» нет — суммы не записаны',
            );
            return;
        }
        const fields = this.buildFields(ctx, list, row, titles);
        buffer.queue(() =>
            this.bitrix.batch.listItem.update(
                EVENT_DOCUMENT_WRITE_CMD.presentationListRow,
                {
                    IBLOCK_ID: String(list.bitrixId),
                    ELEMENT_ID: Number(row.ID),
                    FIELDS: fields,
                },
            ),
        );
    }

    /** Названия документов события, у которых есть вариант «после презентации». */
    private afterPresentationTitles(ctx: EventDocumentContext): string[] {
        if (!ctx.isAfterPresentation) return [];
        return ctx.rules
            .map(rule => rule.afterPresentation?.title)
            .filter((title): title is string => !!title);
    }

    /**
     * Код строки — по основной сделке САМОЙ презентации: менеджер может
     * связать документ с презентацией другой сделки клиента.
     */
    private rowCode(
        ctx: EventDocumentContext,
        presentationDealId: number,
    ): string {
        const linkedBaseDealId = toLinkedDealId(
            ctx.presentationDeal?.[dealLinkKey(this.portal, 'to_base_sales')],
        );
        return salesPresentationListRowCode(
            linkedBaseDealId ?? ctx.baseDealId,
            presentationDealId,
        );
    }

    private async readRow(
        list: IPBXList,
        code: string,
    ): Promise<IBXListItem | null> {
        try {
            const response = (await this.bitrix.listItem.get({
                IBLOCK_ID: String(list.bitrixId),
                ELEMENT_CODE: code,
            })) as { result?: IBXListItem[] };
            return (
                (response?.result ?? []).find(
                    item => String(item.CODE) === code,
                ) ?? null
            );
        } catch (error) {
            // «Элемента нет» у Битрикса — тоже ошибка чтения.
            this.logger.debug(
                `строка ${code} списка «Презентации» не прочитана: ${String(error)}`,
            );
            return null;
        }
    }

    private buildFields(
        ctx: EventDocumentContext,
        list: IPBXList,
        row: IBXListItem,
        titles: string[],
    ): IBXListItemFields {
        // NAME обязателен, все свойства — назад как есть: непереданное
        // Битрикс сотрёт.
        const fields: Record<string, unknown> = { NAME: row.NAME ?? '' };
        for (const [key, value] of Object.entries(row)) {
            if (key.startsWith('PROPERTY_')) {
                fields[key] = normalizeListValues(value);
            }
        }
        this.applySums(ctx, list, fields);
        this.appendComment(ctx, list, fields, titles);
        this.applyProspects(list, fields);
        return fields as IBXListItemFields;
    }

    private applySums(
        ctx: EventDocumentContext,
        list: IPBXList,
        fields: Record<string, unknown>,
    ): void {
        if (ctx.sum === null) return;
        const targets: PbxSalesPresentationListFieldCode[] = [];
        if (ctx.kinds.includes(SALES_DOCUMENT_KIND.offer)) {
            targets.push(FIELD.sumOffer);
        }
        if (ctx.kinds.includes(SALES_DOCUMENT_KIND.invoice)) {
            targets.push(FIELD.sumInvoice);
        }
        for (const code of targets) {
            const key = this.fieldKey(list, code);
            if (key) fields[key] = String(ctx.sum);
        }
    }

    private appendComment(
        ctx: EventDocumentContext,
        list: IPBXList,
        fields: Record<string, unknown>,
        titles: string[],
    ): void {
        const key = this.fieldKey(list, FIELD.doneComment);
        if (!key) return;
        const line = [ctx.documentCrmDateTime, titles.join(', '), ctx.summary]
            .filter(Boolean)
            .join(' ');
        fields[key] = [...normalizeListValues(fields[key]), line];
    }

    private applyProspects(
        list: IPBXList,
        fields: Record<string, unknown>,
    ): void {
        const field = this.portal.getIdByCodeFieldList(
            list,
            FIELD.prospectsType,
        );
        const item = field?.items?.find(
            candidate =>
                candidate.code ===
                PBX_SALES_PRESENTATION_LIST_ITEM_CODES.prospectsGood,
        );
        if (!field?.bitrixCamelId || item?.bitrixId == null) return;
        fields[field.bitrixCamelId] = item.bitrixId;
    }

    /** Ключ свойства (`PROPERTY_123`) по коду поля; null — поля нет. */
    private fieldKey(
        list: IPBXList,
        code: PbxSalesPresentationListFieldCode,
    ): string | null {
        return (
            this.portal.getIdByCodeFieldList(list, code)?.bitrixCamelId || null
        );
    }
}
