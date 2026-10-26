import { Logger } from '@nestjs/common';
import {
    IInnBitrix,
    innId,
    innRow,
    innRows,
    InnRow,
    innText,
} from '@lib/portal-lib/pbx-inn';
import { toBatchCommand } from '../../bitrix-proxy/frame/lib/frame-batch-command';
import {
    DealOwnerSkipReason,
    IOwnedEntity,
    planDealOwnerAlign,
} from '../lib/deal-owner-align.plan';

/** Контактов клиента за раз: одна пачка Битрикса. */
const MAX_CONTACTS = 50;

export interface IDealOwnerAlignResult {
    /** На кого выровняли; null — выравнивать было нечего. */
    responsibleId: number | null;
    skipped: DealOwnerSkipReason | null;
    companyMoved: boolean;
    contactsMoved: number;
    warnings: string[];
}

const ownedOf = (row: InnRow | null): IOwnedEntity | null => {
    const id = innId(row?.ID);
    return id
        ? { id, responsibleId: innId(row?.ASSIGNED_BY_ID) || null }
        : null;
};

/**
 * Компания и контакты сделки — на её ответственного, при открытии своей
 * сделки в «Звонках» (правило 22.10.2026, см. deal-owner-align.plan).
 *
 * Чтение и запись — прямыми вызовами, без общей карты batch-команд
 * инстанса: ручку зовут параллельно разные вкладки одного портала, и
 * накопленные команды одного запроса ушли бы с чужим (CLAUDE.md). Контакты
 * пишутся одним вызовом `batch` со своим набором команд.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class DealOwnerAlignService {
    private readonly logger = new Logger(DealOwnerAlignService.name);

    constructor(
        private readonly bitrix: IInnBitrix,
        private readonly domain: string,
    ) {}

    async align(
        dealId: number,
        userId: number,
    ): Promise<IDealOwnerAlignResult | null> {
        const deal = innRow(
            await this.bitrix.api.call('crm.deal.get', { id: dealId }),
        );
        if (!deal) return null;
        const companyId = innId(deal.COMPANY_ID);
        const dealResponsibleId = innId(deal.ASSIGNED_BY_ID) || null;
        const closed = innText(deal.CLOSED).toUpperCase() === 'Y';

        // Не своя или закрытая — дальше не читаем вовсе.
        const early = planDealOwnerAlign({
            userId,
            dealResponsibleId,
            closed,
            company: null,
            contacts: [],
        });
        if ('skip' in early && early.skip !== 'aligned') {
            return this.skipped(early.skip);
        }

        const company = companyId
            ? innRow(
                  await this.bitrix.api.call('crm.company.get', {
                      id: companyId,
                  }),
              )
            : null;
        const contacts = await this.contacts(dealId, companyId);
        const plan = planDealOwnerAlign({
            userId,
            dealResponsibleId,
            closed,
            company: ownedOf(company),
            contacts,
        });
        if ('skip' in plan) return this.skipped(plan.skip);

        const result: IDealOwnerAlignResult = {
            responsibleId: plan.responsibleId,
            skipped: null,
            companyMoved: false,
            contactsMoved: 0,
            warnings: [],
        };
        const assigned = { ASSIGNED_BY_ID: plan.responsibleId };
        if (plan.companyId) {
            try {
                await this.bitrix.api.call('crm.company.update', {
                    id: plan.companyId,
                    fields: assigned,
                });
                result.companyMoved = true;
            } catch (error) {
                result.warnings.push(
                    `Компания ${plan.companyId}: ${(error as Error).message}`,
                );
            }
        }
        if (plan.contactIds.length) {
            result.contactsMoved = await this.moveContacts(
                plan.contactIds,
                plan.responsibleId,
                result.warnings,
            );
        }
        this.logger.log(
            `[${this.domain}] сделка ${dealId}: компания ` +
                `${result.companyMoved ? plan.companyId : '-'}, контактов ` +
                `${result.contactsMoved}/${plan.contactIds.length} → ${plan.responsibleId}`,
        );
        return result;
    }

    /* ------------------------------------------------------------------ */

    private skipped(reason: DealOwnerSkipReason): IDealOwnerAlignResult {
        return {
            responsibleId: null,
            skipped: reason,
            companyMoved: false,
            contactsMoved: 0,
            warnings: [],
        };
    }

    /** Контакты сделки и её компании с ответственными; сбой — пусто. */
    private async contacts(
        dealId: number,
        companyId: number,
    ): Promise<IOwnedEntity[]> {
        try {
            const ids = new Set<number>();
            const collect = (response: unknown) => {
                for (const row of innRows(response)) {
                    const id = innId(row.CONTACT_ID);
                    if (id) ids.add(id);
                }
            };
            collect(
                await this.bitrix.api.call('crm.deal.contact.items.get', {
                    id: dealId,
                }),
            );
            if (companyId) {
                collect(
                    await this.bitrix.api.call(
                        'crm.company.contact.items.get',
                        {
                            id: companyId,
                        },
                    ),
                );
            }
            if (!ids.size) return [];
            const rows = innRows(
                await this.bitrix.api.call('crm.contact.list', {
                    filter: { '@ID': [...ids].slice(0, MAX_CONTACTS) },
                    select: ['ID', 'ASSIGNED_BY_ID'],
                    start: -1,
                }),
            );
            return rows
                .map(row => ownedOf(row))
                .filter((row): row is IOwnedEntity => row !== null);
        } catch (error) {
            this.logger.warn(
                `[${this.domain}] контакты сделки ${dealId} не прочитаны: ` +
                    (error as Error).message,
            );
            return [];
        }
    }

    /** Один `batch` на все контакты; ошибки команд — в предупреждения. */
    private async moveContacts(
        contactIds: readonly number[],
        responsibleId: number,
        warnings: string[],
    ): Promise<number> {
        const cmd: Record<string, string> = {};
        for (const id of contactIds) {
            cmd[`contact_${id}`] = toBatchCommand('crm.contact.update', {
                id,
                fields: { ASSIGNED_BY_ID: responsibleId },
            });
        }
        try {
            const answer = innRow(
                await this.bitrix.api.call('batch', { halt: 0, cmd }),
            );
            const errors = (answer?.result_error ?? {}) as Record<
                string,
                unknown
            >;
            const failed = Object.keys(errors).filter(key => key in cmd);
            for (const key of failed) {
                warnings.push(
                    `Контакт ${key.replace('contact_', '')}: не переназначен`,
                );
            }
            return contactIds.length - failed.length;
        } catch (error) {
            warnings.push(`Контакты: ${(error as Error).message}`);
            return 0;
        }
    }
}
