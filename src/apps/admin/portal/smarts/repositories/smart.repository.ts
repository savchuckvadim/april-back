import { smarts } from 'generated/prisma';

export abstract class SmartRepository {
    abstract create(smart: Partial<smarts>): Promise<smarts | null>;
    abstract findById(id: number): Promise<smarts | null>;
    abstract findMany(): Promise<smarts[] | null>;
    abstract findByPortalId(portalId: number): Promise<smarts[] | null>;
    abstract update(id: number, smart: Partial<smarts>): Promise<smarts | null>;
    abstract delete(id: number): Promise<boolean>;
}

