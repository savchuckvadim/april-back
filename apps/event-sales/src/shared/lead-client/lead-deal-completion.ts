import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { IField } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { bxFieldId } from '@lib/shared/lib/utils';
import { LeadDataEnrichService } from '../lead-enrich/lead-data-enrich.service';
import { LeadClientKindResolver } from './lead-client-kind';
import { LeadClientLinkService } from './lead-client-link.service';
import {
    ILeadClientBitrix,
    ILeadClientLinkResult,
    LeadClientKind,
    resultOf,
    Row,
} from './lead-client.types';

/** Настройки портала, от которых зависит достройка сделки. */
export interface ILeadDealCompletionSettings {
    /** Создавать клиента у голого лида (настройка `lead_work_link_client`). */
    linkClient: boolean;
    /** Отделы, где лид-организация становится компанией (CSV id). */
    companyDepartmentIds: string;
    /** Сколько последних дел лида привязывать к новым связям. */
    activitiesLimit: number;
}

export interface ILeadDealCompletionResult {
    link: ILeadClientLinkResult | null;
    inns: string[];
    warnings: string[];
}

/**
 * Достройка сделки по её лидам: клиент, затем данные заявки.
 *
 * Порядок важен: сначала клиент — у сделки появляется компания, и обогащение
 * уже видит её ИНН и реквизиты.
 *
 * ОДИН КОД НА ТРИ ВХОДА — хук «лид → работа», ручка «клиент из лида» и
 * перегон данных. НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class LeadDealCompletion {
    private readonly linker: LeadClientLinkService;
    private readonly enricher: LeadDataEnrichService;
    private readonly kinds: LeadClientKindResolver;

    constructor(
        private readonly bitrix: ILeadClientBitrix,
        private readonly portal: PortalModel,
        domain: string,
        private readonly settings: ILeadDealCompletionSettings,
    ) {
        this.linker = new LeadClientLinkService(bitrix);
        this.enricher = new LeadDataEnrichService(bitrix, portal, domain);
        this.kinds = new LeadClientKindResolver(
            bitrix,
            settings.companyDepartmentIds,
            this.leadInnFields(),
        );
    }

    /**
     * `leadIds` не передан — берётся из сделки: штатный `LEAD_ID` и наши
     * поля-связи (`deal_from_lead_id`, `deal_joined_leads`).
     */
    async complete(
        dealId: number,
        leadIds?: readonly number[],
        /**
         * `kind` — во что превращать лид; `none` запрещает создавать клиента
         * даже при включённой настройке портала (вызывающий сказал «не
         * надо»). Не передан — решает настройка.
         */
        options: { kind?: LeadClientKind | 'none' } = {},
    ): Promise<ILeadDealCompletionResult> {
        const result: ILeadDealCompletionResult = {
            link: null,
            inns: [],
            warnings: [],
        };
        let deal = await this.getDeal(dealId);
        if (!deal) {
            result.warnings.push(`Сделка ${dealId} не прочитана`);
            return result;
        }
        const leads = leadIds ?? this.leadIdsOf(deal);
        if (!leads.length) return result;

        const kind = options.kind === 'none' ? null : (options.kind ?? null);
        if (options.kind !== 'none' && (this.settings.linkClient || kind)) {
            const responsible = bxFieldId(deal.ASSIGNED_BY_ID);
            result.link = await this.linker.link(dealId, deal, leads, {
                kind: kind ?? 'contact',
                resolveKind: kind
                    ? undefined
                    : lead => this.kinds.resolve(lead, responsible),
                activitiesLimit: this.settings.activitiesLimit,
            });
            result.warnings.push(...result.link.warnings);
            if (result.link.dealCompanySet) {
                deal = { ...deal, COMPANY_ID: result.link.dealCompanySet };
            }
        }

        const enriched = await this.enricher.enrich(dealId, deal, leads);
        result.inns = enriched.inns;
        result.warnings.push(...enriched.warnings);
        return result;
    }

    /** Все лиды сделки: штатная связь и наши поля. */
    leadIdsOf(deal: Row): number[] {
        const ids = new Set<number>(refIds(deal.LEAD_ID));
        for (const code of [
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        ]) {
            const field = this.portal.getEntityFieldByCode('deal', code);
            if (!field) continue;
            for (const id of refIds(
                deal[this.portal.getFieldBitrixId(field)],
            )) {
                ids.add(id);
            }
        }
        return [...ids];
    }

    private leadInnFields(): string[] {
        return [
            PBX_SALES_KONSTRUCTOR_FIELD_CODES.op_inn,
            PBX_SALES_KONSTRUCTOR_FIELD_CODES.op_inn_pool,
        ]
            .map(code => this.portal.getEntityFieldByCode('lead', code))
            .filter((field): field is IField => !!field)
            .map(field => this.portal.getFieldBitrixId(field));
    }

    private async getDeal(dealId: number): Promise<Row | null> {
        const row = resultOf(
            await this.bitrix.api.call('crm.deal.get', { id: dealId }),
        );
        return row && typeof row === 'object' ? (row as Row) : null;
    }
}

/** `L_12` / `12` / массив — в список id лидов. */
function refIds(raw: unknown): number[] {
    const values = Array.isArray(raw) ? (raw as unknown[]) : [raw];
    return values
        .map(value =>
            bxFieldId(
                typeof value === 'string' ? value.replace(/^L_/, '') : value,
            ),
        )
        .filter((id): id is number => id !== null);
}
