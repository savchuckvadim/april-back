import { EventReportEventType } from '../../../types/event-report.event-codes';
import { ClientEvent } from './event-field-policy.types';

/**
 * Чистые стратегии вычисления значения поля. Ни портала, ни Bitrix, ни
 * контекста — только данные на входе. Всё, что тут есть, покрыто тестами и
 * переиспользуется политиками из каталога.
 */

/**
 * Ближайшее по времени событие клиента нужного типа; `null` — таких нет.
 *
 * Ровно этого не хватало «дате следующего события»: у клиента бывает
 * несколько открытых дел, и следующим будет РАННЕЕ из них — не то, которое
 * менеджер только что запланировал. При равных датах побеждает первое в
 * списке: порядок задаёт вызывающий (планируемое событие идёт последним,
 * поэтому уже существующее дело на ту же минуту не вытесняется новым).
 */
export const nearestEvent = (
    events: readonly ClientEvent[],
    eventTypes?: readonly EventReportEventType[],
): ClientEvent | null => {
    const matching =
        eventTypes && eventTypes.length
            ? events.filter(event => eventTypes.includes(event.eventType))
            : events;

    let nearest: ClientEvent | null = null;
    for (const event of matching) {
        if (!nearest || event.at < nearest.at) nearest = event;
    }
    return nearest;
};

/**
 * Слепая запись: значение поля целиком определяется отчётом.
 *
 * Существует как отдельная стратегия намеренно — чтобы «перезаписываем»
 * было ОСОЗНАННЫМ решением в таблице политик, а не следствием того, что до
 * поля не дошли руки. Для «даты последнего звонка» она и есть правильная.
 */
export const overwrite = <T extends string | number | null>(value: T): T =>
    value;

/**
 * Счётчик: текущее значение + шаг. Нечисловое текущее (пусто, строка из
 * REST) считается нулём — Bitrix отдаёт числа строками, а отсутствующее
 * поле не отдаёт вовсе.
 */
export const increment = (current: unknown, step: number): number => {
    const parsed = Number(current);
    return (Number.isFinite(parsed) ? parsed : 0) + step;
};
