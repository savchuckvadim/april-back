import { ContractEntity } from "./contract.entity";
import { PortalContractEntity } from "./portal-contract.entity";

export abstract class ContractRepository {
    abstract create(contract: Partial<ContractEntity>): Promise<ContractEntity | null>;
    abstract update(contract: Partial<ContractEntity>): Promise<ContractEntity | null>;
    abstract findById(id: number): Promise<ContractEntity | null>;
    abstract findMany(): Promise<ContractEntity[] | null>;
    abstract findByPortalId(portalId: number): Promise<PortalContractEntity[] | null>;
} 