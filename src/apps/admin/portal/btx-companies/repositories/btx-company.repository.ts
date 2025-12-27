import { btx_companies } from 'generated/prisma';

export abstract class BtxCompanyRepository {
    abstract create(company: Partial<btx_companies>): Promise<btx_companies | null>;
    abstract findById(id: number): Promise<btx_companies | null>;
    abstract findMany(): Promise<btx_companies[] | null>;
    abstract findByPortalId(portalId: number): Promise<btx_companies[] | null>;
    abstract update(id: number, company: Partial<btx_companies>): Promise<btx_companies | null>;
    abstract delete(id: number): Promise<boolean>;
}

