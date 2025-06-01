import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { SupplyEntity } from "./supply.entity";
import { SupplyService } from "./services/api/supply.service";
import { ApiTags } from "@nestjs/swagger";
import { SupplyUpdateService } from "./services/update/supply-update.service";


@ApiTags('Garant Supply')
@Controller('supply')
export class SupplyController {
    constructor(
        private readonly supplyService: SupplyService,
        private readonly supplyUpdateService: SupplyUpdateService
    ) { }

    @Post()
    async create(@Body() supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        return this.supplyService.create(supply);
    }

    @Put()
    async update(@Body() supply: Partial<SupplyEntity>): Promise<SupplyEntity | null> {
        return this.supplyService.update(supply);
    }

    @Get(':id')
    async findById(@Param('id') id: string): Promise<SupplyEntity | null> {
        return this.supplyService.findById(id);
    }

    @Get()
    async findMany(): Promise<SupplyEntity[] | null> {
        return this.supplyService.findMany();
    }
    @Get('update-all')
    async updateAll(): Promise<SupplyEntity[] | null> {
        return this.supplyUpdateService.updateAll();
    }
} 