import { FieldEntity } from "./field.entity";

export abstract class FieldRepository {
    abstract findById(id: number): Promise<FieldEntity | null>;
    abstract findByCode(code: string): Promise<FieldEntity | null>;
    abstract findMany(): Promise<FieldEntity[] | null>;
    abstract findManyWithRelations(): Promise<FieldEntity[] | null>;
} 