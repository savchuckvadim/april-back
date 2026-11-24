interface FormatNumberParts {
    prefix: string | null;
    postfix: string | null;
    day: boolean;
    month: boolean;
    year: boolean;
}

/**
 * Правило шага счётчика: значение, которое получит следующий документ.
 * Единый источник для `next` (инкремент в транзакции репозитория) и
 * `preview` (просмотр без записи), чтобы два пути не разошлись.
 */
export function nextCounterValue(count: number, size: number): number {
    return count + size;
}

export function formatDocumentNumber(
    pivot: FormatNumberParts,
    currentCount: number,
): string {
    const now = new Date();
    const parts: string[] = [];

    if (pivot.prefix) {
        parts.push(pivot.prefix);
    }

    parts.push(String(currentCount));

    if (pivot.day) {
        parts.push(String(now.getDate()).padStart(2, '0'));
    }
    if (pivot.month) {
        parts.push(String(now.getMonth() + 1).padStart(2, '0'));
    }
    if (pivot.year) {
        parts.push(String(now.getFullYear()));
    }

    if (pivot.postfix) {
        parts.push(pivot.postfix);
    }

    return parts.join('-');
}

export function fallbackDocumentNumber(rqId: number): string {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const random = Math.floor(Math.random() * 99) + 1;
    return `${rqId}${month}-${random}${day}`;
}
