import { Injectable } from '@nestjs/common';
import { RegionService } from '@lib/garant';

@Injectable()
export class InitRegionService {
    constructor(private readonly regionService: RegionService) {}

    async get() {
        const regions = await this.regionService.findAll();
        return regions;
    }
}
