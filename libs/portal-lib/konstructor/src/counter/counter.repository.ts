import { CounterEntity } from './counter.entity';

/** Данные для создания счётчика (`counters`). */
export interface CreateCounterData {
    name: string;
    title: string;
}

/** Данные для частичного обновления счётчика. */
export type UpdateCounterData = Partial<CreateCounterData>;

export abstract class CounterRepository {
    abstract findById(id: number): Promise<CounterEntity | null>;
    abstract findByRq(rqId: number): Promise<CounterEntity | null>;
    abstract findByTemplate(templateId: number): Promise<CounterEntity | null>;
    abstract findMany(): Promise<CounterEntity[] | null>;
    abstract findManyWithRelations(): Promise<CounterEntity[] | null>;

    abstract create(data: CreateCounterData): Promise<CounterEntity>;
    abstract update(
        id: number,
        data: UpdateCounterData,
    ): Promise<CounterEntity>;
    abstract delete(id: number): Promise<void>;
}
