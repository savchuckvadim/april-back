/**
 * Имя приложения этого процесса (`event-sales`, `konstructor` …).
 *
 * Telegram печатает общий на все приложения APP_NAME, поэтому по тревоге
 * не видно, какое из двенадцати приложений обращалось в Битрикс. Имя ставит
 * bootstrapApp из `options.name` до создания приложения — его видят и
 * кроны, и очереди, и HTTP. Не поставлено (тест, скрипт) — пустая строка,
 * и подпись тревоги просто обходится без имени.
 */
let processAppName = '';

export const setProcessAppName = (name: string): void => {
    processAppName = name.trim();
};

export const getProcessAppName = (): string => processAppName;
