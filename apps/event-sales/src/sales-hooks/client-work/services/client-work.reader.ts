import { NotFoundException } from '@nestjs/common';
import { BitrixService } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { ActiveStaffService } from '../../../shared/active-staff/active-staff.service';
import { toId } from '../../../shared/department-heads/department-heads.util';
import {
    clientGroupsOf,
    clientKey,
} from '../../../duplicate-report/lib/duplicate-groups';
import { DuplicateReportCollector } from '../../../duplicate-report/services/duplicate-report.collector';
import { DuplicateDealsReader } from '../../../duplicate-report/services/duplicate-deals.reader';
import {
    ClassifiedClient,
    DuplicateDeal,
    DuplicateGroup,
} from '../../../duplicate-report/types/duplicate-report.types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Клиент сделки: её компания и основной контакт. */
export interface ClientWorkSource {
    readonly companyId: number | null;
    readonly contactId: number | null;
}

/**
 * Группа клиента сделки среди прочитанных: её компания; без компании —
 * контакт, а если контакт отнесён к единственной компании — эта компания
 * (то же правило, что у отчёта по дублям).
 */
export const pickClientGroup = (
    groups: readonly DuplicateGroup[],
    source: ClientWorkSource,
): DuplicateGroup | null => {
    const byKey = (key: string) =>
        groups.find(group => clientKey(group.client) === key);
    if (source.companyId) {
        return (
            byKey(clientKey({ kind: 'company', id: source.companyId })) ?? null
        );
    }
    if (!source.contactId) return null;
    return (
        byKey(clientKey({ kind: 'contact', id: source.contactId })) ??
        groups.find(group =>
            group.deals.some(deal => deal.contactId === source.contactId),
        ) ??
        null
    );
};

/**
 * «РАБОТА КЛИЕНТА» — открытые сделки «ОП Основная» клиента сделки с тем
 * же разбором, что у еженедельного отчёта по дублям: основная, самая
 * свежая, кто ведёт сам, разные ИНН. Так карточка в «Звонках» и задача с
 * отчётом не спорят, какую сделку оставить.
 *
 * Читаются сделки компании и сделки основного контакта (сделка без
 * компании того же человека — тоже работа клиента). Сама сделка может
 * быть закрыта (уже «Дубль») — тогда показываются остальные открытые.
 *
 * НЕ `@Injectable`: инстанс Битрикса приходит параметром (CLAUDE.md).
 * Чтение последовательное — batch-очередь у инстанса общая.
 */
export class ClientWorkReader {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
        private readonly domain: string,
        private readonly staff: Pick<ActiveStaffService, 'activeUserIds'>,
    ) {}

    /** Клиент с открытыми сделками; null — у сделки нет ни компании, ни контакта. */
    async load(
        dealId: number,
        now: Date,
        warnings: string[],
    ): Promise<ClassifiedClient | null> {
        const source = await this.sourceOf(dealId);
        const group = pickClientGroup(
            clientGroupsOf(await this.clientDeals(source)),
            source,
        );
        if (!group) return null;

        const collector = new DuplicateReportCollector(
            this.bitrix,
            this.portal,
            this.domain,
            this.staff,
        );
        const ownerId = await collector.ownerId(warnings);
        const [client] = await collector.classifyGroups(
            [group],
            {
                now,
                periodStart: new Date(now.getTime() - 7 * DAY_MS),
                periodEnd: now,
            },
            ownerId,
            warnings,
        );
        return client ?? null;
    }

    private async sourceOf(dealId: number): Promise<ClientWorkSource> {
        const response = await this.bitrix.deal.get(dealId, [
            'ID',
            'COMPANY_ID',
            'CONTACT_ID',
        ]);
        const row = response?.result;
        if (!row) throw new NotFoundException(`Сделка ${dealId} не найдена`);
        return {
            companyId: toId(row.COMPANY_ID),
            contactId: toId(row.CONTACT_ID),
        };
    }

    /** Открытые сделки компании и основного контакта, без повторов. */
    private async clientDeals(
        source: ClientWorkSource,
    ): Promise<DuplicateDeal[]> {
        const reader = new DuplicateDealsReader(this.bitrix, this.portal);
        const deals = new Map<number, DuplicateDeal>();
        if (source.companyId) {
            const list = await reader.loadForClient({
                companyId: source.companyId,
            });
            for (const deal of list) deals.set(deal.id, deal);
        }
        if (source.contactId) {
            const list = await reader.loadForClient({
                contactId: source.contactId,
            });
            for (const deal of list) deals.set(deal.id, deal);
        }
        return [...deals.values()];
    }
}
