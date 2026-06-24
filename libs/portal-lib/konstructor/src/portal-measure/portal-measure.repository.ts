import { portal_measure } from 'generated/prisma';

/**
 * Результат бэкфилла таймстампов: сколько строк с `NULL` было заполнено.
 */
export interface PortalMeasureBackfillResult {
    /** Сколько строк получили `created_at` (был `NULL`). */
    createdAtFilled: number;
    /** Сколько строк получили `updated_at` (был `NULL`). */
    updatedAtFilled: number;
}

/**
 * Абстрактный репозиторий портальных единиц измерения (`portal_measure`).
 * Реализация — {@link PortalMeasurePrismaRepository}.
 */
export abstract class PortalMeasureRepository {
    abstract create(
        portalMeasure: Partial<portal_measure>,
    ): Promise<portal_measure | null>;
    abstract findById(id: number): Promise<portal_measure | null>;
    abstract findMany(): Promise<portal_measure[] | null>;
    abstract findByPortalId(portalId: number): Promise<portal_measure[] | null>;
    abstract findByMeasureId(
        measureId: number,
    ): Promise<portal_measure[] | null>;
    /** Поиск связки портал+глобальная measure — нужен для идемпотентной синхронизации. */
    abstract findByPortalAndMeasure(
        portalId: number,
        measureId: number,
    ): Promise<portal_measure | null>;
    abstract update(
        id: number,
        portalMeasure: Partial<portal_measure>,
    ): Promise<portal_measure | null>;
    abstract delete(id: number): Promise<boolean>;
    /**
     * Заполняет `NULL` таймстампы у существующих строк (ремонт «дыр», возникших
     * из-за записей без Laravel-таймстампов). Идемпотентно.
     */
    abstract backfillNullTimestamps(): Promise<PortalMeasureBackfillResult>;
}
