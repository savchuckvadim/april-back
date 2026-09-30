import { IWorkTakeoverScope } from '../../shared/work-takeover';

type BxRow = Record<string, unknown>;

/**
 * ПЛАН принятия одного лида — чистый расчёт без I/O. Нужен двум
 * потребителям: одиночной ручке (кнопка UI) и ПАЧЕЧНОМУ хуку
 * (sales-hooks/lead-accept), который сам batch-читает лиды и batch-пишет
 * план через буфер — предобработка хука экономит сотни вызовов.
 */
export interface LeadAcceptPlan {
    /** Уже принята после последнего назначения — писать нечего. */
    already: boolean;
    /** Поля lead.update (пусто при already или неустановленных полях). */
    fields: BxRow;
    firstprepareSeconds: number | null;
    warnings: string[];
    /**
     * Запись в базовую сделку: стадия «Холодная» + зеркальная строка
     * истории. null — сделки нет либо писать нечего.
     */
    dealUpdate: { dealId: number; fields: BxRow } | null;
    /** ХО-сделка заявки (to_xo_sales) — тоже принявшему. */
    xoDealUpdate: { dealId: number; fields: BxRow } | null;
    /** Кто принял — ему уходят задачи и дела. null — некому/нечего. */
    acceptedBy: number | null;
    /** Чьи открытые задачи и дела перехватывает принявший. */
    takeover: IWorkTakeoverScope;
}

const EMPTY_TAKEOVER: IWorkTakeoverScope = { leadIds: [], dealIds: [] };

/** План «уже принята / подтверждать нечего»: ни записей, ни перехвата. */
export function alreadyAcceptedPlan(warnings: string[]): LeadAcceptPlan {
    return {
        already: true,
        fields: {},
        firstprepareSeconds: null,
        warnings,
        dealUpdate: null,
        xoDealUpdate: null,
        acceptedBy: null,
        takeover: EMPTY_TAKEOVER,
    };
}
