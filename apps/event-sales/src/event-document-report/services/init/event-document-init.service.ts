import { Injectable, Logger } from '@nestjs/common';
import { SalesDocumentEventJobData } from '@lib/queue';
import { BitrixService, IBXCompany, IBXDeal } from '@/modules/bitrix';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { dealLinkKey } from '../../../cold-hook-v2/lib/deal-link-fields';
import {
    EVENT_DOCUMENT_READ_CMD,
    EventDocumentSnapshot,
} from './event-document-init.types';

type BatchResults = Record<string, unknown>;

/** `crm.deal.list`: все стандартные поля и все пользовательские. */
const DEAL_LIST_SELECT_ALL = ['*', 'UF_*'];

/**
 * Чтение карточек для потока документов — одной пачкой.
 *
 * Заменяет легаси-сессию `full/document/init`: там сделки складывались в
 * Redis заранее и к моменту документа могли устареть. Здесь снимок читается
 * в момент события, внутри слота клиента.
 *
 * Инстанс Битрикса приходит параметром (CLAUDE.md: в `@Injectable` его
 * хранить нельзя — портал у каждого события свой).
 */
@Injectable()
export class EventDocumentInitService {
    private readonly logger = new Logger(EventDocumentInitService.name);

    async loadSnapshot(
        event: SalesDocumentEventJobData,
        bitrix: BitrixService,
        portal: PortalModel,
    ): Promise<EventDocumentSnapshot> {
        bitrix.batch.company.get(
            EVENT_DOCUMENT_READ_CMD.company,
            event.companyId,
        );
        bitrix.batch.deal.get(EVENT_DOCUMENT_READ_CMD.baseDeal, event.dealId);
        this.queuePresentationDealRead(event, bitrix, portal);

        const results = this.flatten(
            await bitrix.api.callBatchWithConcurrency(1, { strict: true }),
        );

        const baseDeal = this.pick<IBXDeal>(
            results,
            EVENT_DOCUMENT_READ_CMD.baseDeal,
        );
        if (!baseDeal?.ID) {
            throw new Error(
                `Поток документов: основная сделка ${event.dealId} не найдена ` +
                    `на портале ${event.domain}`,
            );
        }
        return {
            company: this.pick<IBXCompany>(
                results,
                EVENT_DOCUMENT_READ_CMD.company,
            ),
            baseDeal,
            presentationDeal: this.pickPresentationDeal(results, event, portal),
        };
    }

    /**
     * Презентация указана — читаем её сделку. Указан только признак «после
     * презентации» — берём презентации этой основной сделки, свежую выберет
     * {@link pickPresentationDeal}.
     */
    private queuePresentationDealRead(
        event: SalesDocumentEventJobData,
        bitrix: BitrixService,
        portal: PortalModel,
    ): void {
        if (!event.presentation) return;
        if (event.presentation.dealId) {
            bitrix.batch.deal.get(
                EVENT_DOCUMENT_READ_CMD.presentationDeal,
                event.presentation.dealId,
            );
            return;
        }
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        if (!category) return;
        const filter: Partial<IBXDeal> = {
            CATEGORY_ID: category.bitrixId,
            [dealLinkKey(portal, 'to_base_sales')]: event.dealId,
        };
        // Счётчики и даты документа лежат в UF-полях, а `crm.deal.list`
        // отдаёт их только по явному запросу — отсюда select «всё + UF».
        bitrix.batch.deal.getList(
            EVENT_DOCUMENT_READ_CMD.presentationDeals,
            filter,
            DEAL_LIST_SELECT_ALL,
        );
    }

    /** Указанная сделка презентации либо самая свежая из найденных. */
    private pickPresentationDeal(
        results: BatchResults,
        event: SalesDocumentEventJobData,
        portal: PortalModel,
    ): IBXDeal | null {
        const exact = this.pick<IBXDeal>(
            results,
            EVENT_DOCUMENT_READ_CMD.presentationDeal,
        );
        if (exact?.ID) return this.ownPresentationDeal(exact, event, portal);
        const found =
            this.pick<IBXDeal[]>(
                results,
                EVENT_DOCUMENT_READ_CMD.presentationDeals,
            ) ?? [];
        return (
            [...found].sort((a, b) => Number(b.ID) - Number(a.ID))[0] ?? null
        );
    }

    /**
     * Сделка, присланная по id, принимается, только если это презентация
     * ЭТОГО клиента: иначе счётчики и товарные строки документа ушли бы в
     * чужую карточку. Сделки, найденные по ссылке на основную, проверять
     * незачем — они уже отобраны по воронке и связи.
     */
    private ownPresentationDeal(
        deal: IBXDeal,
        event: SalesDocumentEventJobData,
        portal: PortalModel,
    ): IBXDeal | null {
        const category = portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        const isPresentation =
            !category || String(deal.CATEGORY_ID) === String(category.bitrixId);
        const isSameClient =
            String(deal.COMPANY_ID) === String(event.companyId);
        if (isPresentation && isSameClient) return deal;
        this.logger.warn(
            `[document-flow] ${event.domain}: сделка ${deal.ID} — не презентация ` +
                `компании ${event.companyId}; в неё ничего не пишется`,
        );
        return null;
    }

    private flatten(chunks: IBitrixBatchResponseResult[]): BatchResults {
        const flat: BatchResults = {};
        for (const chunk of chunks) Object.assign(flat, chunk.result);
        return flat;
    }

    private pick<T>(results: BatchResults, cmd: string): T | null {
        const value = results[cmd];
        return value === undefined || value === null ? null : (value as T);
    }
}
