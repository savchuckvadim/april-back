import { counters, rq_counter, rqs } from 'generated/prisma';
import { CounterType } from './counter-type.enum';

export type CounterWithRqs = counters & {
    rq_counter: (rq_counter & { rqs: rqs })[];
};

export type RqWithCounters = rqs & {
    rq_counter: (rq_counter & { counters: counters })[];
};

export type RqCounterPivot = Pick<
    rq_counter,
    | 'value'
    | 'type'
    | 'prefix'
    | 'postfix'
    | 'day'
    | 'year'
    | 'month'
    | 'count'
    | 'size'
>;

export interface SerializedCounter {
    id: string;
    name: string;
    title: string;
    created_at: Date | null;
    updated_at: Date | null;
    rqs?: SerializedCounterRq[];
}

export interface SerializedCounterRq {
    rq_id: string;
    rq_name: string | null;
    value: number | null;
    type: CounterType | null;
    prefix: string | null;
    postfix: string | null;
    day: boolean;
    year: boolean;
    month: boolean;
    count: number;
    size: number;
}

export interface RqSelectItem {
    value: number;
    label: string;
}
