/** Факты, из которых определяется «ответственный» разбора звонка. */
export interface CallManagerInput {
    /**
     * PORTAL_USER_ID телефонии из строки транскрибации (`transcription.user_id`) —
     * КТО РЕАЛЬНО ЗВОНИЛ. Источник истины: по нему же работает фильтр
     * «анализировать звонки только этих сотрудников».
     */
    callOwnerUserId?: string | null;
    /** ASSIGNED_BY_ID сделки/лида — владельца активности звонка. */
    entityManagerId?: number;
    /**
     * Сущность-владелец звонка «своя»: лид или сделка одной из воронок ОП.
     * Для сделки ЧУЖОЙ воронки — false: её ответственный к звонку отношения
     * не имеет, и подставлять его нельзя.
     */
    entityIsOwn?: boolean;
}

/**
 * Ответственный смарт-элемента и автор записей таймлайна.
 *
 * ПРАВИЛО (прод-баг 08.09.2026, alfacentr): источник истины — владелец
 * звонка из телефонии. Раньше бралcя только `ASSIGNED_BY_ID` сделки, и при
 * звонке из чужой карточки («звонок Софьи по сделке Анны») карточка разбора
 * доставалась чужому сотруднику, а комментарии таймлайна публиковались от
 * его имени — при том, что аналитика на портале включена на одного человека.
 *
 * Ответственный сущности — только ЗАПАСНОЙ вариант и только если сущность
 * своя (лид или сделка воронки ОП). Владелец звонка неизвестен, а сделка
 * чужая → `undefined`: наугад не подставляем, пусть поле останется пустым.
 */
export function resolveCallManagerId(
    input: CallManagerInput,
): number | undefined {
    const owner = Number(input.callOwnerUserId);
    if (Number.isFinite(owner) && owner > 0) return owner;
    if (!input.entityIsOwn) return undefined;
    return input.entityManagerId && input.entityManagerId > 0
        ? input.entityManagerId
        : undefined;
}
