import { CounterType } from './counter-type.enum';
import {
    CounterWithRqs,
    RqCounterPivot,
    SerializedCounter,
} from './counter.types';

function narrowPivotType(raw: string | null): CounterType | null {
    if (raw === CounterType.INVOICE) return CounterType.INVOICE;
    if (raw === CounterType.OFFER) return CounterType.OFFER;
    if (raw === CounterType.CONTRACT) return CounterType.CONTRACT;
    return null;
}

export function serializeCounter(
    counter: CounterWithRqs | null,
): SerializedCounter | null {
    if (!counter) return null;
    return {
        id: counter.id.toString(),
        name: counter.name,
        title: counter.title,
        created_at: counter.created_at,
        updated_at: counter.updated_at,
        rqs: counter.rq_counter.map(rc => ({
            rq_id: rc.rq_id.toString(),
            rq_name: rc.rqs.name ?? null,
            ...serializePivot(rc),
        })),
    };
}

export function serializePivot(rc: RqCounterPivot) {
    return {
        value: rc.value,
        type: narrowPivotType(rc.type),
        prefix: rc.prefix,
        postfix: rc.postfix,
        day: rc.day,
        year: rc.year,
        month: rc.month,
        count: rc.count,
        size: rc.size,
    };
}
