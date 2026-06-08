import type { IDealReconcilePlan } from '../../usecases/ork-acts-reconcile-plan.use-case';
import type {
    ISmartActWarningTaskSendData,
    SmartActPlanWarningKind,
} from './smart-act-plan-warning.constants';

/**
 * Собирает задачи-предупреждения по фактическому состоянию плана (те же признаки, что и reconcile).
 * `changed_from` сюда не входит — это отдельный сценарий (ручное изменение / свой триггер).
 */
export function buildSmartActWarningTasksFromPlan(
    plan: IDealReconcilePlan,
): ISmartActWarningTaskSendData[] {
    const { dealId, companyId } = plan;
    const out: ISmartActWarningTaskSendData[] = [];
    const push = (type: SmartActPlanWarningKind) => {
        out.push({
            type,
            dealId,
            companyId,
            responsibleId: Number(plan.assignedById),
        });
    };

    if (companyId <= 0) {
        push('has_not_company');
    }

    const { periodData } = plan.item.deal;
    if (!periodData.isFromNotEmpty) {
        push('has_not_from');
    }
    if (!periodData.isToNotEmpty) {
        push('has_not_to');
    }
    if (plan.item.rows.length === 0) {
        push('has_not_product');
    }

    return out;
}
