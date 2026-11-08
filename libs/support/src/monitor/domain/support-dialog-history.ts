/**
 * История обращений в линию поддержки — для статистики по порталам клиентов.
 *
 * Монитор видит только ОТКРЫТЫЕ диалоги, поэтому история складывается из
 * тактов: увидели впервые — строка; видим дальше — обновили; пропал из
 * открытых — закрыт. Диалог, открытый и закрытый между двумя тактами крона,
 * в историю не попадает (такт — несколько минут). Сообщения не храним.
 *
 * Здесь только чистые правила; Prisma — в инфраструктуре.
 */

/** Строка истории (`support_dialogs`) глазами домена. */
export interface SupportDialogHistoryRow {
    id: string;
    lineDomain: string;
    sessionId: number;
    chatId: number;
    lineId: number;
    clientPortal: string | null;
    clientName: string | null;
    operatorName: string | null;
    maxWaitedMinutes: number;
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
    answeredAt: Date | null;
    closedAt: Date | null;
}

/** Что монитор увидел по открытому диалогу в этом такте. */
export interface SupportDialogSeen {
    sessionId: number;
    chatId: number;
    lineId: number;
    clientName: string;
    clientPortal: string | null;
    operatorName: string | null;
    /** Сколько минут клиент ждёт ответа; 0 — не ждёт. */
    waitedMinutes: number;
    /** Неотвеченное сообщение клиента; null — сотрудник ответил. */
    pendingText: string | null;
}

/** Поля, которые такт пишет в строку истории. */
export interface SupportDialogHistoryFields {
    chatId: number;
    lineId: number;
    clientPortal: string | null;
    clientName: string;
    operatorName: string | null;
    maxWaitedMinutes: number;
    lastSeenAt: Date;
    answeredAt: Date | null;
}

export interface SupportDialogHistoryCreate extends SupportDialogHistoryFields {
    sessionId: number;
    firstSeenAt: Date;
}

export interface SupportDialogHistoryUpdate extends SupportDialogHistoryFields {
    id: string;
}

/** Что записать по итогам такта. */
export interface SupportDialogHistoryPlan {
    creates: SupportDialogHistoryCreate[];
    /** Обновления открывают строку заново (`closedAt = null`), если она была закрыта. */
    updates: SupportDialogHistoryUpdate[];
    /** Пропали из открытых — закрыть. */
    closeIds: string[];
}

/** Портал клиента в истории: хост в нижнем регистре, без протокола и пути. */
export function normalizeClientPortal(value: string | null): string | null {
    const host = String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/[/?#].*$/, '');
    return host || null;
}

function fieldsOf(
    seen: SupportDialogSeen,
    known: SupportDialogHistoryRow | null,
    now: Date,
): SupportDialogHistoryFields {
    const answeredNow = seen.pendingText === null ? now : null;
    return {
        chatId: seen.chatId,
        lineId: seen.lineId,
        clientPortal:
            normalizeClientPortal(seen.clientPortal) ??
            known?.clientPortal ??
            null,
        clientName: seen.clientName,
        operatorName: seen.operatorName ?? known?.operatorName ?? null,
        maxWaitedMinutes: Math.max(
            known?.maxWaitedMinutes ?? 0,
            Math.max(0, Math.round(seen.waitedMinutes)),
        ),
        lastSeenAt: now,
        answeredAt: known?.answeredAt ?? answeredNow,
    };
}

/**
 * Сверка такта с историей.
 *
 * @param known   строки линии: открытые и те, чьи сессии видны сейчас
 * @param seen    открытые диалоги такта
 * @param complete список открытых прочитан целиком (без замечаний читателя);
 *                иначе никого не закрываем — недочитанный диалог выглядел бы
 *                закрытым
 */
export function planDialogHistory(
    known: readonly SupportDialogHistoryRow[],
    seen: readonly SupportDialogSeen[],
    now: Date,
    complete: boolean,
): SupportDialogHistoryPlan {
    const bySession = new Map(known.map(row => [row.sessionId, row]));
    const seenIds = new Set(seen.map(dialog => dialog.sessionId));
    const plan: SupportDialogHistoryPlan = {
        creates: [],
        updates: [],
        closeIds: [],
    };
    for (const dialog of seen) {
        const row = bySession.get(dialog.sessionId) ?? null;
        const fields = fieldsOf(dialog, row, now);
        if (row) plan.updates.push({ id: row.id, ...fields });
        else
            plan.creates.push({
                sessionId: dialog.sessionId,
                firstSeenAt: now,
                ...fields,
            });
    }
    if (complete) {
        plan.closeIds = known
            .filter(row => row.closedAt === null && !seenIds.has(row.sessionId))
            .map(row => row.id);
    }
    return plan;
}
