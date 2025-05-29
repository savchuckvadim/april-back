import { Injectable } from "@nestjs/common";
import { InfoblockRepository } from "./infoblock.repository";
import { InfoblockEntity } from "./infoblock.entity";

@Injectable()
export class InfoblockService {
    constructor(private readonly infoblockRepository: InfoblockRepository) { }

    async getInfoblocks(): Promise<InfoblockEntity[] | null> {
        return this.infoblockRepository.findMany();
    }

    async getInfoblockByCode(code: string): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.findByCode(code);
    }

    async getInfoblocksByCodse(codes: string[]): Promise<InfoblockEntity[] | null> {
        return await this.infoblockRepository.findByCodes(codes);
    }

    async getInfoblockById(id: number): Promise<InfoblockEntity | null> {
        return this.infoblockRepository.findById(id);
    }
}
