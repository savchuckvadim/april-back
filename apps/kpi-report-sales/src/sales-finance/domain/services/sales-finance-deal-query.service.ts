/**
 * Запросы сделок воронки «ОП Основная» для финансовой аналитики.
 *
 * НЕ @Injectable: создаётся per-request через `new` с инстансом bitrix
 * из pbx.init(domain) — см. правило про race condition в CLAUDE.md.
 */
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { PBX_SALES_KONSTRUCTOR_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/konstructor/pbx-sales-konstructor-field.type';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx-domain/field/type/sales/event/pbx-sales-event-field.type';
import { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Семантика стадии «успех» в crm.deal.list. */
const STAGE_SEMANTIC_WON = 'S';

export interface SalesFinanceUfFields {
    contractStart: string;
    contractEnd: string;
    contractType: string;
    opHistory: string;
    /** «ОП История (Комментарии)» — multiple; '' если не настроено. */
    opMHistory: string;
    presComments: string;
}

export class SalesFinanceDealQueryService {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    /** Категория sales_base; отсутствие — ошибка конфигурации портала. */
    getSalesBaseCategory(): IPCategory {
        const category = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!category) {
            throw new Error(
                'Категория sales_base («ОП Основная») не настроена на портале',
            );
        }
        return category;
    }

    /** Runtime-коды UF_CRM-полей, нужных финансовой аналитике. */
    getUfFields(): SalesFinanceUfFields {
        const resolve = (code: string): string => {
            const bitrixId = this.portal.getDealFieldBitrixIdByCode(code);
            if (!bitrixId) {
                throw new Error(
                    `Поле сделки с кодом ${code} не настроено на портале`,
                );
            }
            return bitrixId;
        };
        // Опциональные поля: не настроены на портале → '' (селекты фильтруют
        // пустое, значение в отчёте будет null/[]) — не валим весь отчёт.
        const resolveOptional = (code: string): string =>
            this.portal.getDealFieldBitrixIdByCode(code) || '';
        return {
            contractStart: resolve(
                PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_start,
            ),
            contractEnd: resolve(
                PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_end,
            ),
            contractType: resolveOptional(
                PBX_SALES_KONSTRUCTOR_FIELD_CODES.contract_type,
            ),
            opHistory: resolve(PBX_SALES_EVENT_FIELD_CODES.op_history),
            opMHistory: resolveOptional(
                PBX_SALES_EVENT_FIELD_CODES.op_mhistory,
            ),
            presComments: resolve(PBX_SALES_EVENT_FIELD_CODES.pres_comments),
        };
    }

    /** Сделки, закрытые в успех, по сотрудникам и периоду CLOSEDATE. */
    async getWonDealsByCloseDateRange(
        assignedIds: number[],
        dateFrom: string,
        dateTo: string,
    ): Promise<IBXDeal[]> {
        const category = this.getSalesBaseCategory();
        const uf = this.getUfFields();

        // '=ASSIGNED_BY_ID' с массивом — IN-семантика фильтра Bitrix;
        // прямое ASSIGNED_BY_ID объявлено в IBXDeal как string и массив не примет.
        const filter: Partial<IBXDeal> = {
            CATEGORY_ID: category.bitrixId,
            STAGE_SEMANTIC_ID: STAGE_SEMANTIC_WON,
            '=ASSIGNED_BY_ID': assignedIds.map(String),
            '>=CLOSEDATE': dateFrom,
            '<=CLOSEDATE': dateTo,
        };

        return await this.bitrix.deal.all(
            filter,
            [
                'ID',
                'TITLE',
                'ASSIGNED_BY_ID',
                'CLOSEDATE',
                'OPPORTUNITY',
                'STAGE_ID',
                'COMPANY_ID',
                'DATE_MODIFY',
                uf.contractStart,
                uf.contractEnd,
                uf.contractType,
            ].filter(Boolean),
        );
    }

    /** Открытые сделки на заданных стадиях (опц. фильтр по сотрудникам). */
    async getOpenDealsByStageIds(
        stageIds: string[],
        assignedIds?: number[],
    ): Promise<IBXDeal[]> {
        if (stageIds.length === 0) return [];
        const category = this.getSalesBaseCategory();
        const uf = this.getUfFields();

        const filter: Partial<IBXDeal> = {
            CATEGORY_ID: category.bitrixId,
            CLOSED: 'N',
            '=STAGE_ID': stageIds,
        };
        if (assignedIds && assignedIds.length > 0) {
            filter['=ASSIGNED_BY_ID'] = assignedIds.map(String);
        }

        return await this.bitrix.deal.all(
            filter,
            [
                'ID',
                'TITLE',
                'ASSIGNED_BY_ID',
                'STAGE_ID',
                'OPPORTUNITY',
                'COMPANY_ID',
                'DATE_MODIFY',
                uf.opHistory,
                uf.opMHistory,
                uf.presComments,
                uf.contractStart,
                uf.contractEnd,
                uf.contractType,
            ].filter(Boolean),
        );
    }
}
