import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

type BxRow = Record<string, unknown>;

/** Сделка скоупа с кодом её воронки. */
export interface ScopedDeal {
    deal: IBXDeal;
    categoryCode: PbxDealCategoryCodeEnum | null;
}

/** Рабочий скоуп передачи/отказа: только НАШИ воронки. */
export interface SalesScope {
    companyId: number | null;
    deals: ScopedDeal[];
    /** Чужие воронки — читаются, но не участвуют (с причиной). */
    foreign: string[];
    openTasks: IBXTask[];
    warnings: string[];
}

/**
 * Сбор скоупа для transfer (2.2) и reject (2.3): открытые сделки НАШИХ
 * воронок по компании и/или явным dealIds + открытые задачи по CO_/D_.
 * Чужие воронки отсеиваются с причиной — их не трогаем никогда.
 * НЕ @Injectable: new SalesScopeService(bitrix, portal).
 */
export class SalesScopeService {
    private readonly logger = new Logger(SalesScopeService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async collect(input: {
        companyId?: number;
        dealIds?: number[];
        includeClosed?: boolean;
    }): Promise<SalesScope> {
        const warnings: string[] = [];
        const foreign: string[] = [];
        const categoryByBitrixId = this.ourCategories(warnings);

        // === Сделки: по компании (только наши воронки) + явные id.
        if (input.companyId && categoryByBitrixId.size) {
            this.bitrix.batch.deal.getList(
                'scope_company_deals',
                {
                    COMPANY_ID: input.companyId,
                    CATEGORY_ID: [...categoryByBitrixId.keys()],
                    ...(input.includeClosed ? {} : { CLOSED: 'N' }),
                } as never,
                SCOPE_DEAL_SELECT,
            );
        }
        for (const dealId of input.dealIds ?? []) {
            this.bitrix.batch.deal.get(`scope_deal_${dealId}`, dealId);
        }
        const taskBindings: string[] = [];
        if (input.companyId) taskBindings.push(`CO_${input.companyId}`);
        for (const dealId of input.dealIds ?? []) {
            taskBindings.push(`D_${dealId}`);
        }
        for (const binding of taskBindings) {
            this.bitrix.batch.task.getList(
                `scope_tasks_${binding}`,
                {
                    UF_CRM_TASK: [binding],
                    '!STATUS': EBXTaskStatus.COMPLETED,
                } as never,
                [
                    'ID',
                    'TITLE',
                    'RESPONSIBLE_ID',
                    'UF_CRM_TASK',
                    'STATUS',
                    'DEADLINE',
                ],
            );
        }

        const responses = await this.bitrix.api.callBatchWithConcurrency(1);
        const flat = new Map<string, unknown>();
        for (const chunk of responses) {
            for (const [cmd, value] of Object.entries(
                (chunk?.result ?? {}) as Record<string, unknown>,
            )) {
                flat.set(cmd, value);
            }
        }

        const deals: ScopedDeal[] = [];
        const seenDeals = new Set<number>();
        const pushDeal = (row: BxRow | undefined | null) => {
            if (!row || typeof row !== 'object') return;
            const id = Number(row.ID);
            if (!Number.isFinite(id) || seenDeals.has(id)) return;
            const categoryCode =
                categoryByBitrixId.get(Number(row.CATEGORY_ID)) ?? null;
            if (!categoryCode) {
                foreign.push(
                    `DEAL_${id}: чужая воронка (CATEGORY_ID=${String(row.CATEGORY_ID)}) — не трогаем`,
                );
                return;
            }
            seenDeals.add(id);
            deals.push({ deal: row as unknown as IBXDeal, categoryCode });
        };

        for (const row of this.rowsOf(flat.get('scope_company_deals'))) {
            pushDeal(row);
        }
        for (const dealId of input.dealIds ?? []) {
            pushDeal(flat.get(`scope_deal_${dealId}`) as BxRow | undefined);
        }

        const openTasks: IBXTask[] = [];
        const seenTasks = new Set<string>();
        for (const binding of taskBindings) {
            const raw = flat.get(`scope_tasks_${binding}`) as
                | { tasks?: IBXTask[] }
                | undefined;
            for (const task of raw?.tasks ?? []) {
                const row = task as unknown as BxRow;
                const id = this.textOf(row.id) || this.textOf(row.ID);
                if (!id || seenTasks.has(id)) continue;
                seenTasks.add(id);
                openTasks.push(task);
            }
        }

        return {
            companyId: input.companyId ?? null,
            deals,
            foreign,
            openTasks,
            warnings,
        };
    }

    /** bitrixId воронки → её pbx-код (только сконфигурированные). */
    private ourCategories(
        warnings: string[],
    ): Map<number, PbxDealCategoryCodeEnum> {
        const map = new Map<number, PbxDealCategoryCodeEnum>();
        for (const code of Object.values(PbxDealCategoryCodeEnum)) {
            const category = this.portal.getDealCategoryByCode(code);
            const bitrixId = Number(category?.bitrixId);
            if (category && Number.isFinite(bitrixId)) {
                map.set(bitrixId, code);
            }
        }
        if (!map.size) {
            warnings.push(
                'Ни одна наша воронка не сконфигурирована — скоуп сделок пуст',
            );
        }
        return map;
    }

    private rowsOf(raw: unknown): BxRow[] {
        if (Array.isArray(raw)) return raw as BxRow[];
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items))
                return container.items as BxRow[];
            if (Array.isArray(container.result))
                return container.result as BxRow[];
        }
        return [];
    }

    private textOf(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return '';
    }
}

const SCOPE_DEAL_SELECT = [
    'ID',
    'TITLE',
    'CATEGORY_ID',
    'STAGE_ID',
    'ASSIGNED_BY_ID',
    'COMPANY_ID',
    'CLOSED',
];
