import { Injectable } from "@nestjs/common";
import { ContractRepository } from "./contract.repository";
import { ContractEntity } from "./contract.entity";
import { PortalContractEntity } from "./portal-contract.entity";

@Injectable()
export class ContractService {
    constructor(
        private readonly contractRepository: ContractRepository,
    ) { }

    async create(contract: Partial<ContractEntity>): Promise<ContractEntity | null> {
        return await this.contractRepository.create(contract);
    }

    async update(contract: Partial<ContractEntity>): Promise<ContractEntity | null> {
        return await this.contractRepository.update(contract);
    }

    async findById(id: number): Promise<ContractEntity | null> {
        return await this.contractRepository.findById(id);
    }

    async findMany(): Promise<ContractEntity[] | null> {
        return await this.contractRepository.findMany();
    }

    async findByPortalId(portalId: number): Promise<PortalContractEntity[] | null> {
        return await this.contractRepository.findByPortalId(portalId);
    }
} 