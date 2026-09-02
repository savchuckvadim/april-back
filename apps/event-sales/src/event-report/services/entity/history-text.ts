/**
 * Текстовые лимиты полей истории карточки.
 *
 * Два разных поля с двумя разными бедами:
 *  - `op_history` («ОП Текущая история работы») — СКАЛЯР. До 02.09.2026
 *    он перезаписывался каждым отчётом, и «история» показывала ровно одну
 *    последнюю запись. Легаси-хук холодных звонков склеивал его через
 *    « | » без всякого лимита — поле росло, пока Битрикс не отказывал.
 *  - множественные ленты (`op_mhistory`, `pres_comments`, `op_fail_comments`)
 *    ограничены ЧИСЛОМ записей, но не длиной: колонка UTS у Битрикса —
 *    `text`, 64 КБ, а тридцать записей по четыре тысячи символов кириллицы
 *    (два байта каждый) в неё не помещаются — update падает целиком, вместе
 *    со статусами и датами того же отчёта.
 */

/** Разделитель записей скалярной истории — тот же, что у легаси-хука. */
export const HISTORY_SCALAR_SEPARATOR = ' | ';

/**
 * Лимит скалярной истории — на ВСЁ поле, не на запись (решение владельца
 * 02.09.2026): «если до этого уже три раза по 4000 записали, может уже и
 * не влезть». Равен лимиту комментария во фрейме: самый длинный
 * комментарий влезает целиком плюс несколько прошлых записей.
 */
export const HISTORY_SCALAR_MAX_CHARS = 4000;

/**
 * Суммарная длина записей multiple-поля. 24 000 символов — 48 КБ UTF-8 в
 * худшем случае (сплошная кириллица), с запасом под сериализацию массива
 * в 64-килобайтную колонку.
 */
export const MULTI_FIELD_MAX_TOTAL_CHARS = 24_000;

/** Меньше этого хвост старой записи не режем — обрубок без смысла не нужен. */
const MIN_PARTIAL_TAIL = 24;

/**
 * Новая запись ВПЕРЁД прошлого значения скаляра через « | », в лимит.
 *
 * Порядок работы — как просил владелец: берём текущее значение поля,
 * добавляем новое, и старое режется с хвоста, пока всё не влезет. Целые
 * записи отбрасываются по одной; последняя из влезающих режется частично,
 * если остаётся осмысленный хвост. Новая запись длиннее лимита — режется
 * сама: она важнее любой прошлой.
 */
export const joinScalarHistory = (
    line: string,
    previous: string | null | undefined,
    max: number = HISTORY_SCALAR_MAX_CHARS,
): string => {
    const fresh = line.trim();
    if (fresh.length >= max) return fresh.slice(0, max);

    const older = String(previous ?? '')
        .split(HISTORY_SCALAR_SEPARATOR)
        .map(part => part.trim())
        .filter(Boolean);

    let result = fresh;
    for (const part of older) {
        const candidate = `${result}${HISTORY_SCALAR_SEPARATOR}${part}`;
        if (candidate.length <= max) {
            result = candidate;
            continue;
        }
        const room = max - result.length - HISTORY_SCALAR_SEPARATOR.length;
        if (room >= MIN_PARTIAL_TAIL) {
            result = `${result}${HISTORY_SCALAR_SEPARATOR}${part.slice(0, room - 1)}…`;
        }
        break;
    }
    return result;
};

/**
 * Записи multiple-поля — по числу И по суммарной длине.
 *
 * Сначала срез по числу (прежний лимит), затем с хвоста отбрасываются
 * старые записи, пока сумма не влезет. Единственная запись длиннее
 * бюджета режется сама — иначе поле не приняло бы вообще ничего.
 */
export const fitMultipleEntries = (
    entries: readonly string[],
    limitCount: number,
    maxTotalChars: number = MULTI_FIELD_MAX_TOTAL_CHARS,
): string[] => {
    const kept = entries.slice(0, limitCount);
    let total = kept.reduce((sum, entry) => sum + entry.length, 0);
    while (kept.length > 1 && total > maxTotalChars) {
        const dropped = kept.pop() as string;
        total -= dropped.length;
    }
    if (kept.length === 1 && (kept[0] as string).length > maxTotalChars) {
        return [(kept[0] as string).slice(0, maxTotalChars)];
    }
    return kept;
};
