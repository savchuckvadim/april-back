import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    callReportDealText,
    CallReportDealLookup,
    CallReportDealRow,
} from './call-report-deal-lookup';

/** Связи сделок, присланные внешним агентом (LLM). */
export interface CallReportAgentDealGuess {
    mainDealId?: number;
    presentationDealId?: number;
    xoDealId?: number;
}

/** Клиент звонка — по нему сверяется догадка агента. */
export interface CallReportDealClient {
    companyId?: number;
    contactId?: number;
}

/**
 * Проверка сделок, ПРИСЛАННЫХ АГЕНТОМ, по воронкам ОП И ПО КЛИЕНТУ ЗВОНКА.
 *
 * ЗАЧЕМ (прод-баг 08.09.2026): DTO агента валидирует только «целое > 0»,
 * поэтому в поля «ОП: основная сделка» / «Сделка ОП Презентации» могла
 * уехать любая сделка портала — чужой воронки, чужого клиента или вовсе
 * несуществующая. Правило одно для всех писателей: в связь попадает
 * только сделка ПОДТВЕРЖДЁННОЙ воронки И того же клиента, что у звонка
 * (приёмка 08.09.2026: воронка проверялась, клиент — нет, и сделка
 * правильной воронки, но чужой компании проходила проверку).
 *
 * Fail-open: сделка не прочиталась или Битрикс недоступен → связь пустая,
 * разбор звонка не падает.
 */
@Injectable()
export class CallReportDealVerifyService {
    private readonly logger = new Logger(CallReportDealVerifyService.name);

    constructor(private readonly pbxService: PBXService) {}

    /**
     * Догадки агента, оставленные только там, где сделка реально стоит в
     * нужной воронке И принадлежит клиенту звонка. Пустой вход — походов в
     * Битрикс нет вовсе.
     *
     * @param client компания/контакт звонка; пусто — сверять НЕ с чем
     *   (звонок без CRM-клиента), тогда решает только воронка.
     */
    async filterAgentDeals(
        domain: string,
        guess: CallReportAgentDealGuess | undefined,
        client: CallReportDealClient = {},
    ): Promise<CallReportAgentDealGuess> {
        const pairs = [
            [guess?.mainDealId, PbxDealCategoryCodeEnum.sales_base],
            [
                guess?.presentationDealId,
                PbxDealCategoryCodeEnum.sales_presentation,
            ],
            [guess?.xoDealId, PbxDealCategoryCodeEnum.sales_xo],
        ] as const;
        if (!pairs.some(([dealId]) => dealId)) return {};

        try {
            const { bitrix, PortalModel: portal } =
                await this.pbxService.init(domain);
            const lookup = new CallReportDealLookup(
                bitrix.api,
                portal,
                this.logger,
            );
            const [mainDealId, presentationDealId, xoDealId] =
                await Promise.all(
                    pairs.map(([dealId, code]) =>
                        this.keep(lookup, dealId, code, client),
                    ),
                );
            return { mainDealId, presentationDealId, xoDealId };
        } catch (error) {
            this.logger.warn(
                `Связи агента не проверены (${domain}): ` +
                    `${(error as Error).message} — в карточку не пишем`,
            );
            return {};
        }
    }

    /** id сделки, если совпали и воронка, и клиент; иначе undefined. */
    private async keep(
        lookup: CallReportDealLookup,
        dealId: number | undefined,
        code: PbxDealCategoryCodeEnum,
        client: CallReportDealClient,
    ): Promise<number | undefined> {
        if (!dealId) return undefined;
        const deal = await lookup.getDeal(dealId);
        if (!deal || lookup.categoryCodeOf(deal) !== code) {
            this.logger.warn(
                `Сделка ${dealId} от агента не в воронке ${code} ` +
                    '(или не прочитана) — связь не ставим',
            );
            return undefined;
        }
        if (!this.matchesClient(deal, client)) {
            this.logger.warn(
                `Сделка ${dealId} от агента (воронка ${code}) принадлежит ` +
                    'другому клиенту: у звонка компания ' +
                    `${client.companyId ?? '—'} / контакт ${client.contactId ?? '—'}, ` +
                    `у сделки компания ${callReportDealText(deal['COMPANY_ID']) || '—'} / ` +
                    `контакт ${callReportDealText(deal['CONTACT_ID']) || '—'} — связь не ставим`,
            );
            return undefined;
        }
        return dealId;
    }

    /**
     * Сделка того же клиента: совпала компания ЛИБО контакт звонка (у
     * сделки контакт бывает и множественным — CONTACT_IDS).
     *
     * Клиент звонка неизвестен (нет ни компании, ни контакта) — сверять
     * не с чем: решает только воронка, иначе для звонков без CRM-клиента
     * связи агента не поставить вовсе.
     */
    private matchesClient(
        deal: CallReportDealRow,
        client: CallReportDealClient,
    ): boolean {
        if (!client.companyId && !client.contactId) return true;
        const dealCompanyId = Number(deal['COMPANY_ID']) || 0;
        if (client.companyId && dealCompanyId === client.companyId) return true;
        if (client.contactId && this.contactIds(deal).has(client.contactId)) {
            return true;
        }
        return false;
    }

    /** Контакты сделки: основной CONTACT_ID + множественные CONTACT_IDS. */
    private contactIds(deal: CallReportDealRow): Set<number> {
        const raw: unknown[] = [deal['CONTACT_ID']];
        const many: unknown = deal['CONTACT_IDS'];
        if (Array.isArray(many)) raw.push(...(many as unknown[]));
        const ids = new Set<number>();
        for (const value of raw) {
            const id = Number(value) || 0;
            if (id > 0) ids.add(id);
        }
        return ids;
    }
}
