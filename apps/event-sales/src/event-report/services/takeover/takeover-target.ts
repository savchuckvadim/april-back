import {
    EnumColdCallEntityType,
    EnumColdCallIsTmc,
} from '../../../cold-hook-v2/dto/cold.dto';
import { ColdTarget } from '../../../cold-hook-v2/services/target/cold-target.types';
import { EventReportContext } from '../context/event-report.context';
import { positiveId } from '../deal/deal-notice.util';

/**
 * Цель сборщика холодного старта для отчёта: компания клиента, а без
 * компании — сделка запуска (граф её связей). Чистый лид без компании и
 * сделки — null: перехватывать не по чему.
 *
 * Сборщик написан для хука, поэтому `hook` здесь — служебный описатель
 * той же цели; сборщик из него ничего не читает, кроме ключа для логов.
 */
export const coldTargetForReport = (
    ctx: EventReportContext,
): ColdTarget | null => {
    const companyId = positiveId(ctx.company?.ID);
    const entryDeal = ctx.ownerDeal ?? ctx.currentBaseDeal ?? null;
    const entryDealId = positiveId(entryDeal?.ID);
    if (!companyId && !entryDealId) return null;
    const kind = companyId ? 'company' : 'deal';
    return {
        hookKey: `takeover_${companyId ? `co${companyId}` : `d${entryDealId}`}`,
        hook: {
            entityType: companyId
                ? EnumColdCallEntityType.COMPANY
                : EnumColdCallEntityType.DEAL,
            entityId: String(companyId ?? entryDealId),
            isTmc: EnumColdCallIsTmc.N,
        },
        kind,
        company: ctx.company,
        companyId,
        entryDeal,
        rootDealId: positiveId(ctx.currentBaseDeal?.ID),
    };
};
