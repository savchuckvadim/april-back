/**
 * `count` задач по номерам, не больше `parallel` одновременно, в порядке
 * номеров. Первая ошибка останавливает выдачу новых задач; начатые
 * доделываются (вызывающий успевает сохранить их результат), затем
 * ошибка уходит наружу. Результаты — в порядке номеров.
 */
export async function runChunkPool<T>(
    count: number,
    parallel: number,
    work: (index: number) => Promise<T>,
): Promise<T[]> {
    const results = new Array<T>(count);
    const state: { next: number; failure: Error | null } = {
        next: 0,
        failure: null,
    };

    const worker = async (): Promise<void> => {
        while (state.failure === null && state.next < count) {
            const index = state.next;
            state.next += 1;
            try {
                results[index] = await work(index);
            } catch (error) {
                state.failure ??=
                    error instanceof Error ? error : new Error(String(error));
            }
        }
    };

    const workers = Math.max(1, Math.min(Math.floor(parallel) || 1, count));
    await Promise.all(Array.from({ length: workers }, () => worker()));
    if (state.failure !== null) throw state.failure;
    return results;
}
