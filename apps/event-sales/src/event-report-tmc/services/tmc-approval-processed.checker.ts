import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { BitrixDateTime, ETimeZone } from '@lib/shared/lib/date';
import { TMC_DEAL_LINK_FIELD } from '../../event-report/services/deal/tmc-deal-link-fields.const';

/** Что подстраховка знает о заявке, когда спрашивает «уже обработана?». */
export interface TmcApprovalProcessedQuery {
    tmcDealId: number;
    companyId: number;
    /** Менеджер ОП, назначенный при утверждении. */
    managerId: number;
    /** Согласованная дата презентации. */
    deadline: BitrixDateTime;
    /** Момент утверждения заявки; null — Bitrix его не отдал. */
    approvedAt: BitrixDateTime | null;
}

type DealRow = Record<string, unknown>;

/**
 * Сколько минут ДО утверждения созданная презентация ещё считается «по
 * заявке»: часы робота и портала могут расходиться на секунды.
 */
const CREATED_SLACK_MINUTES = 2;

/** `DD.MM.YYYY HH:mm` — до минуты, секунды робот и Bitrix печатают по-разному. */
const toMinute = (value: BitrixDateTime): string =>
    value.toCrmDateTime().slice(0, 16);

const sameMinute = (
    raw: unknown,
    deadline: BitrixDateTime,
    tz: ETimeZone,
): boolean => {
    const planned = BitrixDateTime.fromBitrixField(raw, tz);
    return planned !== null && toMinute(planned) === toMinute(deadline);
};

/**
 * «Презентация по согласованной заявке уже запланирована» — для заявок, у
 * которых нет долгой метки «принято» (приняты легаси-хуком до выкладки или
 * метка потеряна). Три следа отчёта по сделкам компании, любой из них —
 * «обработана»:
 *
 *  1. в воронке презентаций есть сделка, СОЗДАННАЯ после утверждения —
 *     `DATE_CREATE` никто не переписывает, перенос и переназначение ему не
 *     страшны (легаси создавало pres-сделку через секунды после утверждения);
 *  2. у сделки компании ответственный — назначенный менеджер и дата
 *     презентации (`next_pres_plan_date`) — согласованная, до минуты;
 *  3. ТМЦ-сделка ссылается на презентацию (`UF_CRM_TO_PRESENTATION_SALES`)
 *     того же менеджера — даже если дату уже перенесли.
 *
 * Ошибка чтения НЕ превращается в «не обработана»: она уходит наверх, и
 * крон пропускает заявку до следующего тика — лишний повтор согласования
 * стоит клиенту второй презентации, а ожидание получаса — ничего.
 *
 * Не @Injectable — создаётся с per-domain bitrix (правило CLAUDE.md).
 */
export class TmcApprovalProcessedChecker {
    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {}

    async isProcessed(query: TmcApprovalProcessedQuery): Promise<boolean> {
        const tz = this.portal.getTimezone();
        const presCategory = this.portal.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.sales_presentation,
        );
        const planDateKey =
            this.portal.getDealFieldBitrixIdByCode(
                PBX_SALES_EVENT_FIELD_CODES.next_pres_plan_date,
            ) || null;
        const rows = await this.listCompanyDeals(
            query.companyId,
            presCategory?.bitrixId ?? null,
            planDateKey,
        );

        // 1. Презентация создана после утверждения — только когда список
        // ограничен воронкой презентаций: иначе подошла бы любая сделка.
        const createdFrom = query.approvedAt
            ?.toDayjs()
            .subtract(CREATED_SLACK_MINUTES, 'minute');
        if (presCategory && createdFrom) {
            const createdAfter = rows.some(row => {
                const created = BitrixDateTime.fromBitrixField(
                    row.DATE_CREATE,
                    tz,
                )?.toDayjs();
                return created !== undefined && !created.isBefore(createdFrom);
            });
            if (createdAfter) return true;
        }

        // 2. Тот же менеджер на ту же минуту.
        if (
            planDateKey &&
            rows.some(
                row =>
                    Number(row.ASSIGNED_BY_ID) === query.managerId &&
                    sameMinute(row[planDateKey], query.deadline, tz),
            )
        ) {
            return true;
        }

        // 3. Ссылка ТМЦ-сделки на презентацию того же менеджера.
        const tmc = await this.readDeal(query.tmcDealId, [
            'ID',
            TMC_DEAL_LINK_FIELD.toPresentationSales,
        ]);
        const linkedId =
            Number(tmc?.[TMC_DEAL_LINK_FIELD.toPresentationSales]) || 0;
        if (!linkedId) return false;
        const linked =
            rows.find(row => Number(row.ID) === linkedId) ??
            (await this.readDeal(linkedId, ['ID', 'ASSIGNED_BY_ID']));
        return Number(linked?.ASSIGNED_BY_ID) === query.managerId;
    }

    /** Сделки компании (в воронке презентаций, если она известна). Ошибка чтения — наверх. */
    private async listCompanyDeals(
        companyId: number,
        categoryId: number | string | null,
        planDateKey: string | null,
    ): Promise<DealRow[]> {
        const filter: Record<string, unknown> = {
            COMPANY_ID: companyId,
            ...(categoryId !== null ? { CATEGORY_ID: categoryId } : {}),
        };
        const response = (await this.bitrix.deal.getList(
            filter as unknown as Partial<IBXDeal>,
            [
                'ID',
                'ASSIGNED_BY_ID',
                'STAGE_ID',
                'DATE_CREATE',
                ...(planDateKey ? [planDateKey] : []),
            ],
        )) as { result?: DealRow[] | null } | null | undefined;
        return response?.result ?? [];
    }

    private async readDeal(
        dealId: number,
        select: string[],
    ): Promise<DealRow | null> {
        const response = (await this.bitrix.deal.get(dealId, select)) as
            | { result?: DealRow | null }
            | null
            | undefined;
        return response?.result ?? null;
    }
}
