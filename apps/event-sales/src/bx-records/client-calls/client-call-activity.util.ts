/**
 * Дела-звонки Битрикса → звонки клиента с записью. Одно дело приходит по
 * нескольким связям клиента (компания, контакт, сделка, лид) — повторы
 * убираются. Чистые функции.
 */
import { BitrixOwnerTypeId } from '@/modules/bitrix';
import { IBXActivity } from '@/modules/bitrix/domain/activity/interfaces/bx-activity.interface';
import type {
    ClientCallDirection,
    ClientCallOwnerType,
} from './client-calls.const';
import type { ClientCallActivity, ClientCallOwner } from './client-calls.types';

const OWNER_TYPES = new Map<number, ClientCallOwnerType>([
    [Number(BitrixOwnerTypeId.DEAL), 'deal'],
    [Number(BitrixOwnerTypeId.LEAD), 'lead'],
    [Number(BitrixOwnerTypeId.COMPANY), 'company'],
    [Number(BitrixOwnerTypeId.CONTACT), 'contact'],
]);

/** Коды направления в деле Битрикса: 1 — входящий, 2 — исходящий. */
const DIRECTIONS = new Map<number, ClientCallDirection>([
    [1, 'incoming'],
    [2, 'outgoing'],
]);

/** Положительное целое из числа или строки, иначе null. */
const positiveId = (value: unknown): number | null => {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
};

const isoOf = (value: unknown): string | null => {
    if (typeof value !== 'string' || value === '') return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
};

function ownerOf(activity: IBXActivity): ClientCallOwner | null {
    const type = OWNER_TYPES.get(Number(activity.OWNER_TYPE_ID));
    const id = positiveId(activity.OWNER_ID);
    return type === undefined || id === null ? null : { type, id };
}

function callOf(activity: IBXActivity): ClientCallActivity | null {
    const activityId = positiveId(activity.ID);
    if (activityId === null || !activity.FILES?.length) return null;
    const direction: unknown = activity.DIRECTION;
    const subject =
        typeof activity.SUBJECT === 'string' ? activity.SUBJECT.trim() : '';
    return {
        activityId,
        startedAt: isoOf(activity.START_TIME),
        direction: DIRECTIONS.get(Number(direction)) ?? null,
        responsibleId: positiveId(activity.RESPONSIBLE_ID),
        owner: ownerOf(activity),
        subject: subject === '' ? null : subject,
    };
}

/** Свежие первыми: по началу звонка, без него — по номеру дела. */
function byRecency(a: ClientCallActivity, b: ClientCallActivity): number {
    const left = a.startedAt === null ? 0 : Date.parse(a.startedAt);
    const right = b.startedAt === null ? 0 : Date.parse(b.startedAt);
    return right - left || b.activityId - a.activityId;
}

/** Звонки с записью без повторов, свежие первыми. */
export function recordedCallsOf(
    activities: readonly IBXActivity[],
): ClientCallActivity[] {
    const calls = new Map<number, ClientCallActivity>();
    for (const activity of activities) {
        const call = callOf(activity);
        if (call !== null && !calls.has(call.activityId)) {
            calls.set(call.activityId, call);
        }
    }
    return [...calls.values()].sort(byRecency);
}
