import { Logger } from '@nestjs/common';
import { BitrixOwnerTypeId } from '@lib/bitrix/domain/enums/bitrix-constants.enum';
import { bxFieldId } from '@lib/shared/lib/utils';
import { IActivityTarget, LeadActivityBinder } from './lead-activity-binder';
import { LeadClientFactory } from './lead-client-factory';
import {
    ILeadClientBitrix,
    ILeadClientLinkOptions,
    ILeadClientLinkResult,
    ILeadClientPair,
    resultOf,
    Row,
} from './lead-client.types';

/** Больше лидов на сделку не бывает на практике; защита от мусора в поле. */
const MAX_LEADS_PER_DEAL = 5;

/** `crm.activity.list` отдаёт страницу в 50 — больше за один вызов не взять. */
const MAX_ACTIVITIES = 50;

/**
 * Клиенты лидов — в сделку.
 *
 * Для каждого лида сделки:
 *  1. лид голый (ни компании, ни контакта) — создаём клиента из лида
 *     (контакт; компанию — для отделов, работающих с компаниями) и
 *     привязываем к лиду: телефоны и почта уезжают в клиента;
 *  2. клиенты лида привязываются к сделке: контакт — добавляется к её
 *     контактам, компания — ставится, только если у сделки компании нет;
 *  3. если связь появилась в этом прогоне — дела лида привязываются к сделке
 *     и новому клиенту: звонки становятся видны в сделке.
 *
 * Лид не закрывается и статус не меняет: SLA и адресный ХО работают только с
 * открытыми лидами (решение владельца 17.09.2026: «подержать лид открытым»).
 *
 * ОДИН КОД НА ТРИ ВХОДА: хук «лид → работа», ручка конвертации и перегон
 * данных. НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class LeadClientLinkService {
    private readonly logger = new Logger(LeadClientLinkService.name);
    private readonly factory: LeadClientFactory;
    private readonly binder: LeadActivityBinder;

    constructor(private readonly bitrix: ILeadClientBitrix) {
        this.factory = new LeadClientFactory(bitrix);
        this.binder = new LeadActivityBinder(bitrix);
    }

    async link(
        dealId: number,
        deal: Row,
        leadIds: readonly number[],
        options: ILeadClientLinkOptions,
    ): Promise<ILeadClientLinkResult> {
        const result: ILeadClientLinkResult = {
            created: [],
            dealContactsAdded: [],
            dealCompanySet: null,
            activitiesBound: 0,
            warnings: [],
        };
        const dealContacts = await this.dealContactIds(dealId);
        const state = {
            contacts: dealContacts,
            companyId: bxFieldId(deal.COMPANY_ID) ?? 0,
        };

        for (const leadId of leadIds.slice(0, MAX_LEADS_PER_DEAL)) {
            try {
                const lead = await this.get('crm.lead.get', leadId);
                if (!lead) {
                    result.warnings.push(
                        `Лид ${leadId} не прочитан — клиент не привязан`,
                    );
                    continue;
                }
                const kind = options.resolveKind
                    ? await options.resolveKind(lead)
                    : options.kind;
                const client = await this.factory.ensure(
                    lead,
                    deal,
                    state.companyId,
                    kind,
                    result.created,
                );
                /*
                 * К сделке едут ВСЕ контакты лида, а не только главный: у
                 * заявки бывает несколько человек (директор, бухгалтерия), и
                 * терять их при переезде в работу нельзя.
                 */
                for (const contactId of await this.leadContactIds(leadId)) {
                    await this.linkToDeal(
                        dealId,
                        { contactId, companyId: 0, isNew: false },
                        state,
                        result,
                    );
                }
                const linked = await this.linkToDeal(
                    dealId,
                    client,
                    state,
                    result,
                );
                if (client.isNew || linked) {
                    result.activitiesBound += await this.binder.bind(
                        leadId,
                        this.targets(dealId, client),
                        Math.min(options.activitiesLimit, MAX_ACTIVITIES),
                    );
                }
            } catch (error) {
                const message = (error as Error).message;
                this.logger.warn(`сделка ${dealId}, лид ${leadId}: ${message}`);
                result.warnings.push(
                    `Лид ${leadId}: клиент не привязан — ${message}`,
                );
            }
        }
        return result;
    }

    /** Возвращает true, если у сделки появилась новая связь. */
    private async linkToDeal(
        dealId: number,
        client: ILeadClientPair,
        state: { contacts: number[]; companyId: number },
        result: ILeadClientLinkResult,
    ): Promise<boolean> {
        let linked = false;
        if (client.contactId && !state.contacts.includes(client.contactId)) {
            await this.bitrix.api.call('crm.deal.contact.add', {
                id: dealId,
                fields: { CONTACT_ID: client.contactId },
            });
            state.contacts.push(client.contactId);
            result.dealContactsAdded.push(client.contactId);
            linked = true;
        }
        if (client.companyId && !state.companyId) {
            await this.bitrix.api.call('crm.deal.update', {
                id: dealId,
                fields: { COMPANY_ID: client.companyId },
            });
            state.companyId = client.companyId;
            result.dealCompanySet = client.companyId;
            linked = true;
        } else if (client.companyId && client.companyId !== state.companyId) {
            // Чужую компанию сделки не подменяем: её выбирал человек.
            result.warnings.push(
                `Сделка ${dealId}: у лида компания ${client.companyId}, у сделки ${state.companyId} — не меняем`,
            );
        }
        return linked;
    }

    private targets(
        dealId: number,
        client: ILeadClientPair,
    ): IActivityTarget[] {
        const targets: IActivityTarget[] = [
            { typeId: BitrixOwnerTypeId.DEAL, id: dealId },
        ];
        if (client.contactId) {
            targets.push({
                typeId: BitrixOwnerTypeId.CONTACT,
                id: client.contactId,
            });
        }
        if (client.companyId) {
            targets.push({
                typeId: BitrixOwnerTypeId.COMPANY,
                id: client.companyId,
            });
        }
        return targets;
    }

    /** Все контакты лида: главный (`CONTACT_ID`) и привязанные к нему. */
    private async leadContactIds(leadId: number): Promise<number[]> {
        const rows = resultOf(
            await this.bitrix.api.call('crm.lead.contact.items.get', {
                id: leadId,
            }),
        );
        if (!Array.isArray(rows)) return [];
        return (rows as Row[])
            .map(row => bxFieldId(row.CONTACT_ID))
            .filter((id): id is number => id !== null);
    }

    private async dealContactIds(dealId: number): Promise<number[]> {
        const rows = resultOf(
            await this.bitrix.api.call('crm.deal.contact.items.get', {
                id: dealId,
            }),
        );
        if (!Array.isArray(rows)) return [];
        return (rows as Row[])
            .map(row => bxFieldId(row.CONTACT_ID))
            .filter((id): id is number => id !== null);
    }

    private async get(method: string, id: number): Promise<Row | null> {
        const row = resultOf(await this.bitrix.api.call(method, { id }));
        return row && typeof row === 'object' ? (row as Row) : null;
    }
}
