/**
 * Параллельность обработчика очереди: целое ≥ 1 из env, иначе значение по
 * умолчанию.
 *
 * Читается при загрузке модуля — @Process фиксирует concurrency в
 * декораторе; переменные из docker env_file к этому моменту уже в
 * process.env.
 */
export const resolveQueueConcurrency = (
    envName: string,
    fallback: number,
): number => {
    const value = Number(process.env[envName]);
    return Number.isInteger(value) && value >= 1 ? value : fallback;
};
