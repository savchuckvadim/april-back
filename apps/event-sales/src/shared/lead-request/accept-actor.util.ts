type BxRow = Record<string, unknown>;

/** Положительный id из сырого значения Битрикса (строка/число); иначе null. */
const positiveId = (raw: unknown): number | null => {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
};

/**
 * Кто принял заявку: явный userId (кнопка UI); иначе ответственный СДЕЛКИ —
 * робот срабатывает на смену стадии сделки, а двигает её тот, кто работает;
 * иначе ответственный лида (ХО-хук при назначении/передаче ставит туда
 * назначенного). Нет никого — null.
 */
export function acceptActorOf(
    userId: number | undefined,
    dealRow: BxRow | null,
    lead: BxRow | null,
): number | null {
    return (
        userId ??
        positiveId(dealRow?.ASSIGNED_BY_ID) ??
        positiveId(lead?.ASSIGNED_BY_ID)
    );
}

/**
 * Все, кто может оказаться принявшим, — для `UserNameResolver` ДО плана:
 * план — чистый расчёт без I/O, имена ему приносят готовыми. Лишний id
 * обходится даром (тот же batch user.get), пропущенный оставил бы в истории
 * голый id.
 */
export function acceptActorIds(
    userIds: readonly (number | undefined)[],
    rows: readonly (BxRow | null | undefined)[],
): number[] {
    return [
        ...userIds,
        ...rows.map(row => positiveId(row?.ASSIGNED_BY_ID)),
    ].filter((id): id is number => typeof id === 'number' && id > 0);
}
