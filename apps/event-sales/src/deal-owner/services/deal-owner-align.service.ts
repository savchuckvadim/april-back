import { Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
    IInnBitrix,
    innId,
    innRow,
    innRows,
    InnRow,
    innText,
} from '@lib/portal-lib/pbx-inn';
import { toBatchCommand } from '../../bitrix-proxy/frame/lib/frame-batch-command';
import { toLinkedIds } from '../../cold-hook-v2/lib/deal-link-fields';
import {
    DealOwnerSkipReason,
    IOwnedEntity,
    planDealOwnerAlign,
} from '../lib/deal-owner-align.plan';

// Плагины idempotent: extend() повторно — no-op.
dayjs.extend(utc);
dayjs.extend(timezone);

/** Контактов клиента за раз: одна пачка Битрикса. */
const MAX_CONTACTS = 50;
/** Лидов заявки за раз: одна пачка Битрикса. */
const MAX_LEADS = 50;
/** Лид ещё в работе (не сконвертирован и не забракован). */
const LEAD_IN_PROGRESS_SEMANTIC = 'P';
/** Формат CRM datetime-полей Битрикса (локальное время портала). */
const CRM_DATETIME_FORMAT = 'DD.MM.YYYY HH:mm:ss';

/**
 * UF-имена полей из слепка портала: сервис не держит PortalModel, чтобы
 * оставаться чистым классом с инстансом Битрикса на домен.
 */
export interface IDealOwnerAlignFields {
    /** Поля сделки со ссылками на лиды (первоисточник, присоединённые). */
    dealLeadLinks: readonly string[];
    /** «Менеджер по продажам Гарант» на лиде; null — поле не установлено. */
    leadManagerOp: string | null;
    /** Таймер принятия заявки на лиде; null — поле не установлено. */
    leadAssignedAt: string | null;
    /** Часовой пояс портала — таймер пишется локальным временем. */
    timezone: string;
}

const NO_FIELDS: IDealOwnerAlignFields = {
    dealLeadLinks: [],
    leadManagerOp: null,
    leadAssignedAt: null,
    timezone: 'Europe/Moscow',
};

export interface IDealOwnerAlignResult {
    /** На кого выровняли; null — выравнивать было нечего. */
    responsibleId: number | null;
    skipped: DealOwnerSkipReason | null;
    companyMoved: boolean;
    contactsMoved: number;
    /** Лидов заявки переведено на ответственного сделки. */
    leadsMoved: number;
    warnings: string[];
}

/** Открытый лид заявки: ждёт ли он ещё принятия (таймер не снят). */
interface IOwnedLead extends IOwnedEntity {
    waiting: boolean;
}

const ownedOf = (row: InnRow | null): IOwnedEntity | null => {
    const id = innId(row?.ID);
    return id
        ? { id, responsibleId: innId(row?.ASSIGNED_BY_ID) || null }
        : null;
};

/**
 * Компания, контакты и лиды заявки — на ответственного сделки, при
 * открытии своей сделки в «Звонках» (правила 22.10 и 03.11.2026, см.
 * deal-owner-align.plan).
 *
 * Чтение и запись — прямыми вызовами, без общей карты batch-команд
 * инстанса: ручку зовут параллельно разные вкладки одного портала, и
 * накопленные команды одного запроса ушли бы с чужим (CLAUDE.md). Контакты
 * и лиды пишутся своими вызовами `batch` с собственным набором команд.
 *
 * НЕ `@Injectable()`: инстанс Битрикса свой на каждый домен.
 */
export class DealOwnerAlignService {
    private readonly logger = new Logger(DealOwnerAlignService.name);

    constructor(
        private readonly bitrix: IInnBitrix,
        private readonly domain: string,
        private readonly fields: IDealOwnerAlignFields = NO_FIELDS,
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
            leads: [],
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
        const leads = await this.openLeads(this.leadIdsOf(deal));
        const plan = planDealOwnerAlign({
            userId,
            dealResponsibleId,
            closed,
            company: ownedOf(company),
            contacts,
            leads,
        });
        if ('skip' in plan) return this.skipped(plan.skip);

        const result: IDealOwnerAlignResult = {
            responsibleId: plan.responsibleId,
            skipped: null,
            companyMoved: false,
            contactsMoved: 0,
            leadsMoved: 0,
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
        if (plan.leadIds.length) {
            const waiting = new Set(
                leads.filter(lead => lead.waiting).map(lead => lead.id),
            );
            result.leadsMoved = await this.moveLeads(
                plan.leadIds,
                waiting,
                plan.responsibleId,
                result.warnings,
            );
        }
        this.logger.log(
            `[${this.domain}] сделка ${dealId}: компания ` +
                `${result.companyMoved ? plan.companyId : '-'}, контактов ` +
                `${result.contactsMoved}/${plan.contactIds.length}, лидов ` +
                `${result.leadsMoved}/${plan.leadIds.length} → ${plan.responsibleId}`,
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
            leadsMoved: 0,
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

    /**
     * Лиды сделки: штатный `LEAD_ID` и pbx-ссылки (первоисточник,
     * присоединённые) — у сделки из заявки штатное поле пусто.
     */
    private leadIdsOf(deal: InnRow): number[] {
        const ids = new Set(toLinkedIds(deal.LEAD_ID, /^L_/i));
        for (const key of this.fields.dealLeadLinks) {
            for (const id of toLinkedIds(deal[key], /^L_/i)) ids.add(id);
        }
        return [...ids].slice(0, MAX_LEADS);
    }

    /**
     * Открытые лиды с ответственными и признаком «ждёт принятия».
     * Сконвертированные и забракованные не трогаем; сбой чтения — пусто.
     */
    private async openLeads(leadIds: readonly number[]): Promise<IOwnedLead[]> {
        if (!leadIds.length) return [];
        const assignedAt = this.fields.leadAssignedAt;
        try {
            const rows = innRows(
                await this.bitrix.api.call('crm.lead.list', {
                    filter: { '@ID': leadIds },
                    select: [
                        'ID',
                        'ASSIGNED_BY_ID',
                        'STATUS_SEMANTIC_ID',
                        ...(assignedAt ? [assignedAt] : []),
                    ],
                    start: -1,
                }),
            );
            const leads: IOwnedLead[] = [];
            for (const row of rows) {
                const owned = ownedOf(row);
                if (!owned) continue;
                const semantic = innText(row.STATUS_SEMANTIC_ID).toUpperCase();
                if (semantic && semantic !== LEAD_IN_PROGRESS_SEMANTIC) {
                    continue;
                }
                leads.push({
                    ...owned,
                    waiting: !!assignedAt && innText(row[assignedAt]) !== '',
                });
            }
            return leads;
        } catch (error) {
            this.logger.warn(
                `[${this.domain}] лиды сделки не прочитаны: ` +
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
        return this.runBatch(cmd, 'contact_', 'Контакт', warnings);
    }

    /**
     * Один `batch` на все лиды: ответственный и «Менеджер по продажам»
     * идут вместе (решение владельца 17.09), а у ждущих принятия заново
     * стартует окно принятия — SLA отсчитает порог для нового сотрудника,
     * а не передаст заявку по чужой просрочке.
     */
    private async moveLeads(
        leadIds: readonly number[],
        waiting: ReadonlySet<number>,
        responsibleId: number,
        warnings: string[],
    ): Promise<number> {
        const now = dayjs()
            .tz(this.fields.timezone)
            .format(CRM_DATETIME_FORMAT);
        const cmd: Record<string, string> = {};
        for (const id of leadIds) {
            const fields: Record<string, unknown> = {
                ASSIGNED_BY_ID: responsibleId,
            };
            if (this.fields.leadManagerOp) {
                fields[this.fields.leadManagerOp] = responsibleId;
            }
            if (this.fields.leadAssignedAt && waiting.has(id)) {
                fields[this.fields.leadAssignedAt] = now;
            }
            cmd[`lead_${id}`] = toBatchCommand('crm.lead.update', {
                id,
                fields,
            });
        }
        return this.runBatch(cmd, 'lead_', 'Лид', warnings);
    }

    /** Пачка команд; ошибки отдельных команд — в предупреждения, сбой — 0. */
    private async runBatch(
        cmd: Record<string, string>,
        prefix: string,
        label: string,
        warnings: string[],
    ): Promise<number> {
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
                    `${label} ${key.replace(prefix, '')}: не переназначен`,
                );
            }
            return Object.keys(cmd).length - failed.length;
        } catch (error) {
            warnings.push(`${label}ы: ${(error as Error).message}`);
            return 0;
        }
    }
}
