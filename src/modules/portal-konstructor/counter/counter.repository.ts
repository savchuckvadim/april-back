import { CounterEntity } from "./counter.entity";

export abstract class CounterRepository {
    abstract findById(id: number): Promise<CounterEntity | null>;
    abstract findByRq(rqId: number): Promise<CounterEntity | null>;
    abstract findByTemplate(templateId: number): Promise<CounterEntity | null>;
    abstract findMany(): Promise<CounterEntity[] | null>;
    abstract findManyWithRelations(): Promise<CounterEntity[] | null>;
}