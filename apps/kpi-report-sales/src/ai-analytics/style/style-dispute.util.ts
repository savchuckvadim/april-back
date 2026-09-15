/**
 * Несогласие СУБЪЕКТА подписи стиля (документ
 * `ai/tasks/ai-analytics-manager-style.md`, §1.3).
 *
 * Принцип: ни один ярлык о человеке не используется нигде, кроме
 * карточки, пока человек не мог его увидеть и оспорить. Ответ «не
 * согласен» от самого сотрудника ставит на подпись `disputed`: в
 * карточке она остаётся с пометкой «оспорена менеджером», а вне карточки
 * (совет, повестка, подбор эталонов, дайджест) не используется до
 * следующего пересчёта. Несогласие РОПа — другой канал: оно считается
 * долей несогласий и подпись не снимает.
 *
 * Чистые функции: без DI и хранилища.
 */

/** Объект обратной связи по профилю целиком. */
export const STYLE_FEEDBACK_OBJECT = 'style' as const;

/** Префикс объекта одной подписи: `style:tag:<code>`. */
export const STYLE_FEEDBACK_TAG_PREFIX = 'style:tag:' as const;

/** Все подписи профиля (несогласие с профилем целиком). */
export const STYLE_DISPUTE_ALL = 'all' as const;

/**
 * Что оспаривает объект обратной связи: код подписи, `all` — профиль
 * целиком, null — объект вообще не про стиль.
 */
export function styleDisputeTarget(object: string): string | null {
    if (object === STYLE_FEEDBACK_OBJECT) return STYLE_DISPUTE_ALL;
    if (!object.startsWith(STYLE_FEEDBACK_TAG_PREFIX)) return null;
    const code = object.slice(STYLE_FEEDBACK_TAG_PREFIX.length).trim();
    return code === '' ? null : code;
}

/** Автор обратной связи — сам субъект подписи, а не руководитель. */
export function isStyleSubject(
    requesterUserId: string,
    managerId: string | null,
): boolean {
    return managerId !== null && String(Number(requesterUserId)) === managerId;
}

/** Коды подписей нагрузки снапшота (чужая форма записи отбрасывается). */
export function tagCodesOf(payload: unknown): string[] {
    const tags = (payload as { tags?: unknown } | null)?.tags;
    if (!Array.isArray(tags)) return [];
    return tags.flatMap(item => {
        const code = (item as { code?: unknown })?.code;
        return typeof code === 'string' && code !== '' ? [code] : [];
    });
}

/** Уже оспоренные коды нагрузки. */
export function disputedCodesOf(payload: unknown): string[] {
    const codes = (payload as { disputedTags?: unknown } | null)?.disputedTags;
    if (!Array.isArray(codes)) return [];
    return codes.filter(
        (code): code is string => typeof code === 'string' && code !== '',
    );
}

/**
 * Новый список оспоренных кодов для нагрузки: `all` — все подписи
 * профиля, код — только он (и только если такая подпись в профиле есть).
 * Ничего не изменилось — null, чтобы не писать копию снапшота.
 */
export function nextDisputedTags(
    payload: unknown,
    target: string,
): string[] | null {
    const known = tagCodesOf(payload);
    const requested =
        target === STYLE_DISPUTE_ALL
            ? known
            : known.filter(code => code === target);
    if (requested.length === 0) return null;
    const current = [...disputedCodesOf(payload)].sort();
    const merged = [...new Set([...current, ...requested])].sort();
    const unchanged =
        merged.length === current.length &&
        merged.every((code, index) => code === current[index]);
    return unchanged ? null : merged;
}
