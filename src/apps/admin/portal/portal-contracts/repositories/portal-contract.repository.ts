import { portal_contracts } from 'generated/prisma';

export abstract class PortalContractRepository {
    abstract create(portalContract: Partial<portal_contracts>): Promise<portal_contracts | null>;
    abstract findById(id: number): Promise<portal_contracts | null>;
    abstract findMany(): Promise<portal_contracts[] | null>;
    abstract findByPortalId(portalId: number): Promise<portal_contracts[] | null>;
    abstract findByContractId(contractId: number): Promise<portal_contracts[] | null>;
    abstract update(id: number, portalContract: Partial<portal_contracts>): Promise<portal_contracts | null>;
    abstract delete(id: number): Promise<boolean>;
}

