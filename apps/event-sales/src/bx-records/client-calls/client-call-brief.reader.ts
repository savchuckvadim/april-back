/**
 * Короткий итог разбора из `ais.user_result` для строки списка звонков.
 * Нагрузка — произвольный JSON разных версий промпта: поле не того типа
 * читается как отсутствующее. Оценку в список не отдаём. Чистые функции.
 */
import {
    asBoolean,
    asRecord,
    asRecordArray,
    asString,
    asStringArray,
} from '@lib/call-lib/call-report-analytics/lib/json-value.util';
import { callTypeTitleOf } from '@lib/sales-ai-analytics';
import type { ClientCallBrief, ClientCallNextStep } from './client-calls.types';

/** Непустой текст без пробелов по краям. */
const text = (value: unknown): string | null => {
    const trimmed = asString(value)?.trim();
    return trimmed ? trimmed : null;
};

/** Подпись типа звонка; кода нет в справочнике — null (код не показываем). */
function callTypeTitle(callType: string | null): string | null {
    if (callType === null) return null;
    const title = callTypeTitleOf(callType);
    return title === callType ? null : title;
}

function nextStepOf(value: unknown): ClientCallNextStep | null {
    const record = asRecord(value);
    const set = asBoolean(record?.set);
    if (record === null || set === null) return null;
    return {
        set,
        description: text(record.description),
        date: text(record.date),
    };
}

/** Итог разбора; нагрузка не объект — null (разбора нет). */
export function readClientCallBrief(
    userResult: unknown,
): ClientCallBrief | null {
    const source = asRecord(userResult);
    if (source === null) return null;
    return {
        callTypeTitle: callTypeTitle(text(source.callType)),
        summary: text(source.summary),
        nextStep: nextStepOf(source.nextStep),
        objections: asRecordArray(source.objections).length,
        incomplete: asStringArray(source.incompleteParts).length > 0,
    };
}
