import { Injectable } from "@nestjs/common";
import { RegionService } from "@/modules/garant";

@Injectable()
export class InitRegionService {
    constructor(
        private readonly regionService: RegionService
    ) { }

    async get() {
        const regions = await this.regionService.findAll()
        return regions
    }
}