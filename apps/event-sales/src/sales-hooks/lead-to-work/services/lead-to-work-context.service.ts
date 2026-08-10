import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany, IBXDeal, IBXLead } from '@/modules/bitrix';
import { IBXTask } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { EBXTaskStatus } from '@/modules/bitrix/domain/tasks/task/interface/task.interface';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';

/** Снимок всего, что нужно флоу по одному лиду. */
export interface LeadToWorkContext {
    lead: IBXLead;
    company: IBXCompany | null;
    /** Наша основная сделка по обратной ссылке лида to_base_sales. */
    existingOurDeal: IBXDeal | null;
    /** Наша ХО-сделка по обратной ссылке лида to_xo_sales (повторный ХО). */
    existingXoDeal: IBXDeal | null;
    /** Сделки, рождённые штатной конвертацией (deal.LEAD_ID = лид). */
    convertedDeals: IBXDeal[];
    openTasks: IBXTask[];
    /** Лид закрыт штатной конвертацией (SEMANTICS='S'/CONVERTED). */
    isConverted: boolean;
    warnings: string[];
}

type BxRow = Record<string, unknown>;

/**
 * Prefetch контекста лида двумя волнами batch (2 HTTP):
 *   W1: лид;
 *   W2: компания + наша сделка (to_base_sales) + сделки конвертации + задачи.
 *
 * НЕ @Injectable: создаётся `new` с per-domain bitrix.
 */
export class LeadToWorkContextService {
    private readonly logger = new Logger(LeadToWorkContextService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async load(leadId: number): Promise<LeadToWorkContext> {
        const warnings: string[] = [];

        const leadResponse = await this.bitrix.lead.get(leadId);
        const lead = leadResponse?.result;
        if (!lead) {
            throw new Error(`Лид ${leadId} не найден на портале`);
        }

        const companyId = this.numberOf((lead as BxRow).COMPANY_ID);
        const ourDealId = this.parseDealRef(
            this.leadFieldValue(
                lead as BxRow,
                PBX_SALES_EVENT_FIELD_CODES.to_base_sales,
            ),
        );
        const xoDealId = this.parseDealRef(
            this.leadFieldValue(
                lead as BxRow,
                PBX_SALES_EVENT_FIELD_CODES.to_xo_sales,
            ),
        );

        // === Волна 2: окружение одним batch ===
        if (companyId) {
            this.bitrix.batch.company.get('ctx_company', companyId);
        }
        if (ourDealId) {
            this.bitrix.batch.deal.get('ctx_our_deal', ourDealId);
        }
        if (xoDealId) {
            // Повторный ХО: существующая ХО-сделка нужна для передачи
            // ответственного и KPI «не состоялся» прежнему менеджеру.
            this.bitrix.batch.deal.get('ctx_our_xo_deal', xoDealId);
        }
        // Штатная конвертация: гейт против сделки-дубля.
        this.bitrix.batch.deal.getList(
            'ctx_converted_deals',
            { LEAD_ID: leadId } as never,
            ['ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'CLOSED', 'COMPANY_ID'],
        );
        const taskGroupId = this.portal.getSalesTaskGroupId();
        const taskBindings = [`L_${leadId}`];
        if (companyId) taskBindings.push(`CO_${companyId}`);
        for (const binding of taskBindings) {
            this.bitrix.batch.task.getList(
                `ctx_tasks_${binding}`,
                {
                    UF_CRM_TASK: [binding],
                    '!STATUS': EBXTaskStatus.COMPLETED,
                    ...(taskGroupId ? { GROUP_ID: taskGroupId } : {}),
                } as never,
                ['ID', 'TITLE', 'RESPONSIBLE_ID', 'UF_CRM_TASK', 'STATUS'],
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

        const company = companyId
            ? ((flat.get('ctx_company') as IBXCompany | undefined) ?? null)
            : null;
        const existingOurDeal = ourDealId
            ? ((flat.get('ctx_our_deal') as IBXDeal | undefined) ?? null)
            : null;
        const existingXoDeal = xoDealId
            ? ((flat.get('ctx_our_xo_deal') as IBXDeal | undefined) ?? null)
            : null;
        const convertedDeals = this.rowsOf(
            flat.get('ctx_converted_deals'),
        ) as unknown as IBXDeal[];

        const openTasks: IBXTask[] = [];
        const seenTaskIds = new Set<string>();
        for (const binding of taskBindings) {
            const raw = flat.get(`ctx_tasks_${binding}`) as
                | { tasks?: IBXTask[] }
                | undefined;
            for (const task of raw?.tasks ?? []) {
                const row = task as unknown as BxRow;
                const id = this.textOf(row.id) || this.textOf(row.ID);
                if (!id || seenTaskIds.has(id)) continue;
                seenTaskIds.add(id);
                openTasks.push(task);
            }
        }

        const semantics = this.textOf(
            (lead as BxRow).STATUS_SEMANTIC_ID,
        ).toUpperCase();
        const isConverted =
            semantics === 'S' ||
            this.textOf((lead as BxRow).STATUS_ID) === 'CONVERTED';

        return {
            lead,
            company,
            existingOurDeal,
            existingXoDeal,
            convertedDeals,
            openTasks,
            isConverted,
            warnings,
        };
    }

    /** Значение UF-поля лида по pbx-коду; null при ненайденном поле. */
    leadFieldValue(lead: BxRow, code: string): unknown {
        const field = this.portal.getEntityFieldByCode('lead', code);
        if (!field) return null;
        return lead[this.portal.getFieldBitrixId(field)];
    }

    /** UF-имя поля сделки по pbx-коду; null → поле не установлено. */
    dealFieldName(code: string): string | null {
        const field = this.portal.getEntityFieldByCode('deal', code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    /** Разбор ссылки `D_123` / `123` на id сделки. */
    parseDealRef(raw: unknown): number | null {
        const values = Array.isArray(raw) ? raw : [raw];
        for (const value of values) {
            if (value == null) continue;
            const text = String(value as string | number).trim();
            const match = /^(?:D_)?(\d+)$/.exec(text);
            if (match) return Number(match[1]);
        }
        return null;
    }

    private numberOf(raw: unknown): number | null {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    }

    /** Скаляр → строка; объекты не сериализуем ('[object Object]'-защита). */
    private textOf(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return '';
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
}
