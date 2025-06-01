import { Injectable, HttpException, HttpStatus } from "@nestjs/common";
import { SupplyEntity } from "../../supply.entity";
import { SupplyRepository } from "../../supply.repository";
import { SupplyParseService } from "./parse.service";
@Injectable()
export class SupplyUpdateService {
    constructor(
        private readonly supplyRepository: SupplyRepository,
        private readonly parseService: SupplyParseService
    ) { }


    async updateAll(): Promise<SupplyEntity[] | null> {
        const supplies = await this.parseService.getSupplies()
        if (!supplies) {
            throw new HttpException('No supplies found', HttpStatus.BAD_REQUEST)
        }
        return this.supplyRepository.updateAll(supplies);
    }
} 