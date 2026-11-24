/**
 * Номер счёта по порядку выпуска в одной генерации, как в легаси Laravel:
 * первый счёт получает введённый номер N, следующие — N-1, N-2 и так далее.
 * Пустой номер остаётся пустым, суффикс к нему не пристраивается.
 *
 * @param baseNumber номер, который менеджер ввёл в запросе
 * @param position порядковый номер счёта в генерации с нуля: у первого 0
 */
export const formatInvoiceNumber = (
    baseNumber: string | undefined | null,
    position: number,
): string => {
    const base = baseNumber ?? '';
    if (!base.trim() || position <= 0) {
        return base;
    }
    return `${base}-${position}`;
};
