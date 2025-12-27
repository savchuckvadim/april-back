import { portal_measure } from 'generated/prisma';

export abstract class PortalMeasureRepository {
    abstract create(portalMeasure: Partial<portal_measure>): Promise<portal_measure | null>;
    abstract findById(id: number): Promise<portal_measure | null>;
    abstract findMany(): Promise<portal_measure[] | null>;
    abstract findByPortalId(portalId: number): Promise<portal_measure[] | null>;
    abstract findByMeasureId(measureId: number): Promise<portal_measure[] | null>;
    abstract update(id: number, portalMeasure: Partial<portal_measure>): Promise<portal_measure | null>;
    abstract delete(id: number): Promise<boolean>;
}

