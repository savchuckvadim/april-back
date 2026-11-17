/**
 * Движение сделок: итог записей в ленту сделок за прогон (решение
 * 17.11.2026) — общий для состояния прогона (Redis), дневного снимка (ais),
 * Telegram и админки. Чистые типы без DI.
 */
import type { DealMovementNoteKind } from '@lib/portal-lib/store/app-settings/lib/deal-movement-note-kinds.const';

export interface DealMovementNotesSummary {
    /** Запись в ленту включена настройкой портала. */
    enabled: boolean;
    /** Вид записи; null — запись выключена. */
    kind: DealMovementNoteKind | null;
    /** Записей в плане прогона (в пределах лимита ночи). */
    planned: number;
    written: number;
    /** Не удалось записать: расхождение остаётся до следующей ночи. */
    failed: number;
    /** Отложено лимитом записей за ночь. */
    deferredLimit: number;
    /** Отложено защитой от метаний: по сделке писали меньше трёх суток назад. */
    deferredQuiet: number;
    /** Подсказок «что сделать», вошедших в записи. */
    texts: number;
    /** Вызовов модели без годного ответа (сбой или меньше двух строк). */
    textsFailed: number;
}

export const emptyDealMovementNotesSummary = (
    kind: DealMovementNoteKind | null,
): DealMovementNotesSummary => ({
    enabled: kind !== null,
    kind,
    planned: 0,
    written: 0,
    failed: 0,
    deferredLimit: 0,
    deferredQuiet: 0,
    texts: 0,
    textsFailed: 0,
});
