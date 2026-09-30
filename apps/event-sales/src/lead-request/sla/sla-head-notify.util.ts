import { LeadRequestHistoryActor } from '../../shared/lead-request/lead-request-history.util';

/** Минимум от инстанса Битрикса для рассылки: системные уведомления. */
export interface SlaNotifyClient {
    imNotify: {
        systemAdd(data: { USER_ID: number; MESSAGE: string }): Promise<unknown>;
    };
}

/** Кому уведомление не ушло и почему. */
export interface SlaNotifyFailure {
    headUserId: number;
    error: string;
}

/**
 * Системное уведомление каждому руководителю отдела (руководитель +
 * заместители): сбой одного адресата не отменяет остальных — он
 * возвращается списком, предупреждение формулирует вызывающий.
 */
export async function notifyHeads(
    bitrix: SlaNotifyClient,
    headUserIds: readonly number[],
    message: string,
): Promise<SlaNotifyFailure[]> {
    const failures: SlaNotifyFailure[] = [];
    for (const headUserId of headUserIds) {
        try {
            await bitrix.imNotify.systemAdd({
                USER_ID: headUserId,
                MESSAGE: message,
            });
        } catch (error) {
            failures.push({
                headUserId,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return failures;
}

/**
 * Руководителю: заявку не приняли за порог и передали другому.
 * `responsible` — имя непринявшего (нет имени — id, нет никого — без скобок).
 */
export function notAcceptedHeadMessage(input: {
    domain: string;
    lead: Record<string, unknown>;
    leadId: number;
    minutes: number;
    responsible: LeadRequestHistoryActor;
}): string {
    const { domain, lead, leadId, minutes, responsible } = input;
    const title = typeof lead.TITLE === 'string' ? lead.TITLE : `Лид ${leadId}`;
    return (
        `Заявка «${title}» не принята сотрудником за ${minutes} мин` +
        (responsible ? ` (ответственный: ${responsible})` : '') +
        ` — передана другому. [URL=https://${domain}/crm/lead/details/${leadId}/]Открыть лид[/URL]`
    );
}
