import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';

/** Воронки ОП: открытая сделка здесь без живой «ОП Основная» — висяк, не работа. */
const OP_CATEGORY_CODES = [
    PbxDealCategoryCodeEnum.sales_base,
    PbxDealCategoryCodeEnum.sales_xo,
    PbxDealCategoryCodeEnum.sales_presentation,
] as const;
const CHUNK = 50;
/** Ждёт контроля (4) и завершена (5) — для работы задача уже закрыта. */
const DONE_TASK_STATUSES = [4, 5];

/**
 * «Работа с клиентом идёт в другой воронке» — правило владельца 15.11.2026:
 *  - считаются только ЧУЖИЕ воронки (сопровождение, «Общая» и т. п.) и только
 *    сделки с открытой задачей: открытая сделка без задач — висяк;
 *  - открытые ХО и презентации без живой «ОП Основная» работой не являются —
 *    это подозрительно (отчёт не дошёл до них), их отдаём в разбор.
 *
 * НЕ @Injectable: создаётся `new` с инстансом Битрикса конкретного портала.
 */
export class LeadForeignWorkReader {
    private readonly opCategoryIds: ReadonlySet<string>;

    constructor(
        private readonly bitrix: BitrixService,
        portal: PortalModel,
    ) {
        this.opCategoryIds = new Set(
            OP_CATEGORY_CODES.map(
                code => portal.getDealCategoryByCode(code)?.bitrixId,
            )
                .filter(id => id !== undefined && id !== null)
                .map(String),
        );
    }

    isOpFunnel(deal: IBXDeal): boolean {
        return this.opCategoryIds.has(String(deal.CATEGORY_ID));
    }

    /** Открытые сделки чужих воронок, по которым есть открытая задача. */
    async working(deals: IBXDeal[]): Promise<Set<number>> {
        const ids = [
            ...new Set(
                deals
                    .filter(
                        deal => deal.CLOSED === 'N' && !this.isOpFunnel(deal),
                    )
                    .map(deal => Number(deal.ID)),
            ),
        ];
        const working = new Set<number>();
        for (let i = 0; i < ids.length; i += CHUNK) {
            const chunk = ids.slice(i, i + CHUNK);
            const { tasks } = await this.bitrix.task.getAll(
                {
                    UF_CRM_TASK: chunk.map(id => `D_${id}`),
                    '!REAL_STATUS': DONE_TASK_STATUSES,
                },
                ['ID', 'UF_CRM_TASK'],
            );
            for (const task of tasks) {
                for (const binding of task.ufCrmTask ?? []) {
                    const id = Number(String(binding).replace(/^D_/, ''));
                    if (
                        String(binding).startsWith('D_') &&
                        chunk.includes(id)
                    ) {
                        working.add(id);
                    }
                }
            }
        }
        return working;
    }
}
