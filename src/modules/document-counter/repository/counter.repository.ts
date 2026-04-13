import { rq_counter } from 'generated/prisma';
import {
    CounterWithRqs,
    RqSelectItem,
    RqWithCounters,
} from '../lib/counter.types';
import { CounterType } from '../lib/counter-type.enum';
import { CreateCounterDto } from '../document-counter.dto';

export abstract class CounterRepository {
    abstract create(dto: CreateCounterDto): Promise<CounterWithRqs>;

    abstract findById(counterId: number): Promise<CounterWithRqs | null>;

    abstract findAllByRq(rqId: number): Promise<RqWithCounters | null>;

    abstract findMany(): Promise<CounterWithRqs[]>;

    abstract remove(counterId: number): Promise<void>;

    abstract getSelectRqs(rqId?: number): Promise<RqSelectItem[]>;

    abstract findPivot(
        rqId: number,
        type: CounterType,
    ): Promise<rq_counter | null>;

    /**
     * Atomically increments the counter and returns the new count value.
     * Uses a DB transaction to guarantee no two callers get the same number.
     */
    abstract incrementAndGet(
        rqId: bigint,
        counterId: bigint,
        size: number,
    ): Promise<number>;
}
