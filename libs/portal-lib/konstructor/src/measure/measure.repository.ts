import { measures } from 'generated/prisma';

/**
 * Абстрактный репозиторий глобальных единиц измерения (`measures`).
 * Реализация — {@link MeasurePrismaRepository}.
 */
export abstract class MeasureRepository {
    abstract create(measure: Partial<measures>): Promise<measures | null>;
    abstract findById(id: number): Promise<measures | null>;
    abstract findMany(): Promise<measures[] | null>;
    abstract update(
        id: number,
        measure: Partial<measures>,
    ): Promise<measures | null>;
    abstract delete(id: number): Promise<boolean>;
}
