import { Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx/pbx.service';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/** Сделки клиента по воронкам ОП — кандидаты для связей. */
export interface AgentDealCandidates {
    salesBase: Record<string, unknown>[];
    salesPresentation: Record<string, unknown>[];
    salesXo: Record<string, unknown>[];
}

/** Клиент звонка — по нему ищутся сделки-кандидаты. */
export interface AgentCallClient {
    companyId: string | null;
    contactId: string | null;
}

/** Сколько сделок одной воронки показываем агенту (свежие — первыми). */
const DEAL_CANDIDATES_PER_CATEGORY = 20;

/** Поля сделок-кандидатов: воронка, стадия, закрытость и даты. */
const DEAL_CANDIDATE_SELECT = [
    'ID',
    'TITLE',
    'CATEGORY_ID',
    'STAGE_ID',
    'CLOSED',
    'ASSIGNED_BY_ID',
    'COMPANY_ID',
    'CONTACT_ID',
    'DATE_CREATE',
    'DATE_MODIFY',
];

type Bitrix = Awaited<ReturnType<PBXService['init']>>['bitrix'];
type Portal = Awaited<ReturnType<PBXService['init']>>['PortalModel'];

/**
 * Сделки КЛИЕНТА звонка (компания И контакт) по воронкам ОП
 * (sales_base / sales_presentation / sales_xo) — кандидаты связей
 * DEAL_MAIN/DEAL_PRESENTATION/DEAL_XO для агента.
 *
 * ЗАКРЫТЫЕ СДЕЛКИ НЕ ОТСЕИВАЮТСЯ (прод-случай 08.09.2026): целевая сделка
 * живого звонка стояла в стадии «Не состоялась», и фильтр «только
 * активные» оставлял агента вообще без кандидатов. Поиск идёт и по
 * КОНТАКТУ: у сделки может не быть компании.
 *
 * НЕ Injectable: создаётся под домен (`new …(bitrix, portal, logger)`) —
 * правило CLAUDE.md про this.bitrix в @Injectable.
 */
export class AgentDealCandidatesLoader {
    constructor(
        private readonly bitrix: Bitrix,
        private readonly portal: Portal,
        private readonly logger: Logger,
    ) {}

    /** Пустой набор — клиента не знаем или читать не удалось. */
    static empty(): AgentDealCandidates {
        return { salesBase: [], salesPresentation: [], salesXo: [] };
    }

    async load(client: AgentCallClient): Promise<AgentDealCandidates> {
        if (!client.companyId && !client.contactId) {
            return AgentDealCandidatesLoader.empty();
        }
        const filters: Record<string, string>[] = [];
        if (client.companyId) filters.push({ COMPANY_ID: client.companyId });
        if (client.contactId) filters.push({ CONTACT_ID: client.contactId });

        const byId = new Map<string, Record<string, unknown>>();
        for (const filter of filters) {
            for (const deal of await this.listDeals(filter)) {
                const id = this.rowId(deal);
                if (id) byId.set(id, deal);
            }
        }
        if (!byId.size) return AgentDealCandidatesLoader.empty();

        const deals = [...byId.values()];
        return {
            salesBase: this.byCode(deals, PbxDealCategoryCodeEnum.sales_base),
            salesPresentation: this.byCode(
                deals,
                PbxDealCategoryCodeEnum.sales_presentation,
            ),
            salesXo: this.byCode(deals, PbxDealCategoryCodeEnum.sales_xo),
        };
    }

    /** Сделки одной воронки ОП: воронка резолвится через PortalModel. */
    private byCode(
        deals: Record<string, unknown>[],
        code: PbxDealCategoryCodeEnum,
    ): Record<string, unknown>[] {
        const categories = this.portal.getDealCategories() ?? [];
        return deals
            .filter(deal => {
                const category = categories.find(
                    item => String(item.bitrixId) === String(deal.CATEGORY_ID),
                );
                return category?.code === code;
            })
            .sort((left, right) => this.candidateOrder(left, right))
            .slice(0, DEAL_CANDIDATES_PER_CATEGORY);
    }

    /** Сделки по одному фильтру клиента; ошибка чтения — пустой список. */
    private async listDeals(
        filter: Record<string, string>,
    ): Promise<Record<string, unknown>[]> {
        try {
            const response = await this.bitrix.deal.getList(
                filter as never,
                DEAL_CANDIDATE_SELECT,
            );
            return (response.result ?? []) as unknown as Record<
                string,
                unknown
            >[];
        } catch (error) {
            this.logger.warn(
                'Сделки-кандидаты не собраны (фильтр ' +
                    `${Object.keys(filter).join(',')}): ${(error as Error).message}`,
            );
            return [];
        }
    }

    /** Порядок кандидатов: сначала открытые, затем свежие по id. */
    private candidateOrder(
        left: Record<string, unknown>,
        right: Record<string, unknown>,
    ): number {
        const closed = (deal: Record<string, unknown>): number => {
            const value = deal.CLOSED;
            return typeof value === 'string' && value.toUpperCase() === 'Y'
                ? 1
                : 0;
        };
        return (
            closed(left) - closed(right) ||
            Number(right.ID ?? 0) - Number(left.ID ?? 0)
        );
    }

    /** id строки сделки; пусто — строка непригодна. */
    private rowId(deal: Record<string, unknown>): string {
        const id = Number(deal.ID);
        return Number.isFinite(id) && id > 0 ? String(id) : '';
    }
}
