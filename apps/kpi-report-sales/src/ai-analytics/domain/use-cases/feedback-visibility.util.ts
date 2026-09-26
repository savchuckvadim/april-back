/**
 * Что из записей обратной связи видит пользователь в `feedback/list`:
 *  - только пользовательские реакции — служебные виды (alert_sent,
 *    digest_sent, agenda_sent, rop_mark) пишут push-контур, алерты и
 *    слепая проверка, в пользовательский список они не попадают;
 *  - список без managerId у руководителя с ограниченным периметром (op,
 *    group) — только менеджеры периметра, а записи без менеджера — только
 *    тем, кто видит всех (cup). Список по одному менеджеру уже сужен
 *    выборкой стора, а видимость менеджера проверена до неё.
 */
import type { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_SERVICE_FEEDBACK_KINDS } from '../../constants/ai-feedback.const';
import {
    filterByPerimeter,
    type RequesterAccess,
} from '../access/perimeter.util';

/** Служебный вид (доставка, алерт, метка руководителя)? */
export function isServiceFeedbackKind(kind: AiAnalyticsFeedbackKind): boolean {
    return (
        AI_ANALYTICS_SERVICE_FEEDBACK_KINDS as readonly AiAnalyticsFeedbackKind[]
    ).includes(kind);
}

/**
 * Записи списка обратной связи, видимые requester'у. `scopedManagerId` —
 * менеджер, до которого сужена выборка (null — список по всем).
 */
export function visibleFeedbackRecords<
    T extends { kind: AiAnalyticsFeedbackKind; managerId: string | null },
>(
    records: readonly T[],
    access: RequesterAccess,
    scopedManagerId: string | null,
): T[] {
    const userFacing = records.filter(
        record => !isServiceFeedbackKind(record.kind),
    );
    return scopedManagerId === null
        ? filterByPerimeter(userFacing, access)
        : userFacing;
}
