import { Logger } from '@nestjs/common';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { uniq } from '@lib/portal-lib/pbx-duplicate';
import { InnFieldMap } from '../lib/inn-fields';
import { innRefIds, observeInnGraph } from '../lib/inn-observe.util';
import { innId, innRow, innRows, InnRow, innText } from '../lib/inn-row.util';
import {
    IInnAuditEvent,
    IInnObservation,
    IInnRequisiteCard,
} from '../type/inn.type';
import { InnAuditReader } from './inn-audit.reader';
import {
    IInnRequisiteBitrix,
    InnRequisiteReader,
} from './inn-requisite.reader';

/** Сырое состояние ИНН сделки: всё прочитанное, без выводов. */
export interface IInnDealState {
    dealId: number;
    deal: InnRow;
    /** Сделка закрыта (успех или отказ) — менять ИНН нельзя. */
    closed: boolean;
    companyId: number;
    companyTitle: string;
    leadIds: number[];
    observations: IInnObservation[];
    requisites: IInnRequisiteCard[];
    requisitesReadable: boolean;
    linkedRequisiteId: number;
    audit: IInnAuditEvent[];
    /** ИНН → компании портала, у которых он в реквизите (кроме нашей). */
    otherCompanies: Map<string, number[]>;
    fields: InnFieldMap;
}

/** Сколько заявок и контактов сделки читаем. */
const MAX_LEADS = 5;
const MAX_CONTACTS = 5;

/**
 * Чтение всего, что нужно для карточки ИНН: сделка, её заявки, компания,
 * контакты, реквизиты, привязка реквизита и аудит из таймлайна.
 *
 * Отдельный сервис, потому что у него одна ответственность — ввод-вывод.
 * Выводы (кандидаты, конфликты, версия) делает чистый композитор, и его
 * можно проверить тестом без единого похода в Битрикс.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class InnDealStateReader {
    private readonly logger = new Logger(InnDealStateReader.name);
    private readonly fields: InnFieldMap;
    private readonly requisites: InnRequisiteReader;
    private readonly audit: InnAuditReader;

    constructor(
        private readonly bitrix: IInnRequisiteBitrix,
        private readonly portal: PortalModel,
        domain: string,
    ) {
        this.fields = InnFieldMap.from(portal);
        this.requisites = new InnRequisiteReader(bitrix, domain);
        this.audit = new InnAuditReader(bitrix);
    }

    async read(dealId: number): Promise<IInnDealState | null> {
        const deal = innRow(
            await this.bitrix.api.call('crm.deal.get', { id: dealId }),
        );
        if (!deal) return null;

        const companyId = innId(deal.COMPANY_ID);
        const [company, contacts, linkedRequisiteId, audit] = await Promise.all(
            [
                companyId ? this.company(companyId) : Promise.resolve(null),
                this.contacts(dealId),
                this.requisites.linkedRequisiteId(dealId),
                this.audit.read(dealId),
            ],
        );

        const leadIds = this.leadIdsOf(deal);
        const leads = await this.leads(leadIds);
        const cards = await this.requisites.cards({
            companyId,
            companyTitle: innText(company?.TITLE),
            contacts,
        });
        const links = await this.requisites.dealsByRequisite(
            cards.cards.map(card => card.id),
            dealId,
        );
        for (const card of cards.cards) {
            card.linked = card.id === linkedRequisiteId;
            card.otherDealIds = links.get(card.id) ?? [];
        }

        const observations = observeInnGraph(
            { dealId, deal, leads, company, requisites: cards.cards },
            this.fields,
        );
        const otherCompanies = await this.requisites.companiesByInn(
            uniq(observations.map(item => item.inn)),
            companyId,
        );

        return {
            dealId,
            deal,
            closed: innText(deal.CLOSED).toUpperCase() === 'Y',
            companyId,
            companyTitle: innText(company?.TITLE),
            leadIds,
            observations,
            requisites: cards.cards,
            requisitesReadable: cards.readable,
            linkedRequisiteId,
            audit,
            otherCompanies,
            fields: this.fields,
        };
    }

    /** Заявки сделки: штатный `LEAD_ID` и наши поля-связи. */
    private leadIdsOf(deal: InnRow): number[] {
        const ids = innRefIds(deal.LEAD_ID);
        for (const code of [
            PBX_SALES_EVENT_FIELD_CODES.deal_from_lead_id,
            PBX_SALES_EVENT_FIELD_CODES.deal_joined_leads,
        ]) {
            const field = this.portal.getEntityFieldByCode('deal', code);
            if (!field) continue;
            ids.push(...innRefIds(deal[this.portal.getFieldBitrixId(field)]));
        }
        return uniq(ids).slice(0, MAX_LEADS);
    }

    private async leads(ids: readonly number[]): Promise<InnRow[]> {
        const rows: InnRow[] = [];
        for (const id of ids) {
            try {
                const lead = innRow(
                    await this.bitrix.api.call('crm.lead.get', { id }),
                );
                if (lead) rows.push(lead);
            } catch (error) {
                // Удалённая заявка — не повод ронять карточку ИНН.
                this.logger.warn(
                    `Заявка ${id} не прочитана: ${(error as Error).message}`,
                );
            }
        }
        return rows;
    }

    private async company(companyId: number): Promise<InnRow | null> {
        try {
            return innRow(
                await this.bitrix.api.call('crm.company.get', {
                    id: companyId,
                }),
            );
        } catch (error) {
            this.logger.warn(
                `Компания ${companyId} не прочитана: ` +
                    (error as Error).message,
            );
            return null;
        }
    }

    /** Контакты сделки — у них тоже бывают реквизиты (частый случай ИП). */
    private async contacts(
        dealId: number,
    ): Promise<{ id: number; title: string }[]> {
        try {
            const ids = innRows(
                await this.bitrix.api.call('crm.deal.contact.items.get', {
                    id: dealId,
                }),
            )
                .map(row => innId(row.CONTACT_ID ?? row.id ?? row.ID))
                .filter(Boolean)
                .slice(0, MAX_CONTACTS);
            if (!ids.length) return [];

            // Одним запросом: имена нужны только для подписи карточки.
            const rows = innRows(
                await this.bitrix.api.call('crm.contact.list', {
                    filter: { '@ID': ids },
                    select: ['ID', 'NAME', 'LAST_NAME'],
                    start: -1,
                }),
            );
            const titles = new Map<number, string>();
            for (const row of rows) {
                titles.set(
                    innId(row.ID),
                    [innText(row.LAST_NAME), innText(row.NAME)]
                        .filter(Boolean)
                        .join(' '),
                );
            }
            return ids.map(id => ({ id, title: titles.get(id) ?? '' }));
        } catch (error) {
            this.logger.warn(
                `Контакты сделки ${dealId} не прочитаны: ` +
                    (error as Error).message,
            );
            return [];
        }
    }
}
