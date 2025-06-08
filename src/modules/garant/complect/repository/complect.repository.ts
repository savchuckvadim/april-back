import { ComplectEntity } from "../complect.entity";

export abstract class ComplectRepository {
    abstract create(complect: Partial<ComplectEntity>): Promise<ComplectEntity | null>;
    abstract update(complect: Partial<ComplectEntity>): Promise<ComplectEntity | null>;
    abstract findById(id: string): Promise<ComplectEntity | null>;
    abstract findMany(): Promise<ComplectEntity[] | null>;
    abstract findByCode(code: string): Promise<ComplectEntity | null>;
} 