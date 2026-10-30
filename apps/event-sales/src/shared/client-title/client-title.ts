/**
 * НАЗВАНИЕ КЛИЕНТА БЕЗ ЗАГЛУШЕК — общие правила для лида, сделки и ХО.
 *
 * В полях названия у части карточек лежит не название (garant, 21–23.10.2026):
 *  - номер вместо компании: ИНН в «Название компании» лида (лиды 196219 и
 *    260353 → сделки «4703142743» и «3110023165»; Ростов, лид 155867);
 *  - вид звонка в «Название ХО» карточки: «Холодный обзвон» → 961 сделка
 *    ХО «Холодный обзвон Холодный обзвон» за 05–23.10.2026.
 * Такие значения пропускаем и берём следующий источник названия.
 */

/** Только номер: «4703142743», «ИНН 4703142743», цифры с пробелами. */
export const isNumberTitle = (value: string): boolean =>
    /^(инн)?[\s:№#]*\d[\d\s]*$/iu.test(value.trim());

/** Вид звонка вместо названия: «Холодный обзвон», «ХОЛОДНЫЙ ЗВОНОК». */
export const isCallKindTitle = (value: string): boolean =>
    /^холодн\S*\s+(обзвон|звонок)$/iu.test(value.trim().replace(/\s+/g, ' '));

/** Заглушка Битрикса у карточки без названия: «Сделка #110153». */
export const isCrmPlaceholderTitle = (value: string): boolean =>
    /^(сделка|лид)\s*#?\s*\d+$/iu.test(value.trim());

/** Текст поля — или null, если он пустой или это не название клиента. */
export const clientTitleOrNull = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (
        !value ||
        isNumberTitle(value) ||
        isCallKindTitle(value) ||
        isCrmPlaceholderTitle(value)
    ) {
        return null;
    }
    return value;
};
