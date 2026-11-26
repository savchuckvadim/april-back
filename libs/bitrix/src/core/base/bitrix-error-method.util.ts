/**
 * Какой метод Битрикса вызывался, когда упала ошибка.
 *
 * Ядро (BitrixCore) бросает ошибку axios как есть, и метода в ней нет. Адрес
 * запроса содержит ключ вебхука портала, брать метод из `config.url` нельзя.
 * Поэтому метод запоминается рядом с ошибкой, вне её полей. Сериализация
 * ошибки (лог, JSON) остаётся прежней, и код выше получает ответ на два
 * вопроса: «это ошибка вызова Битрикса?» и «какого именно метода?».
 */
const methods = new WeakMap<object, string>();

/** Запомнить метод Битрикса, на котором упала ошибка. */
export const noteBitrixCallMethod = (error: unknown, method: string): void => {
    if (typeof error === 'object' && error !== null) {
        methods.set(error, method);
    }
};

/** Метод Битрикса, на котором упала ошибка; null — ошибка не из вызова Битрикса. */
export const bitrixCallMethodOf = (error: unknown): string | null =>
    typeof error === 'object' && error !== null
        ? (methods.get(error) ?? null)
        : null;
