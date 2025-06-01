import { Injectable } from "@nestjs/common";
import { SupplyEntity } from "../../supply.entity";
import { SupplyRepository } from "../../supply.repository";

@Injectable()
export class SupplyService {
    constructor(
        private readonly supplyRepository: SupplyRepository
    ) { }

    async create(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        return this.supplyRepository.create(supply);
    }

    async update(supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        return this.supplyRepository.update(supply);
    }

    async findById(id: string): Promise<SupplyEntity | null> {
        return this.supplyRepository.findById(id);
    }

    async findMany(): Promise<SupplyEntity[] | null> {
        return this.supplyRepository.findMany();
    }

} 