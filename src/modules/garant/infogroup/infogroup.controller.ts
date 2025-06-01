import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import { InfogroupEntity } from "./infogroup.entity";
import { InfogroupService } from "./infogroup.service";
import { ApiTags } from "@nestjs/swagger";

@ApiTags('Garant')
@Controller('infogroup')
export class InfogroupController {
    constructor(private readonly infogroupService: InfogroupService) { }

    @Post()
    async create(@Body() infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null> {
        return this.infogroupService.create(infogroup);
    }

    @Put()
    async update(@Body() infogroup: Partial<InfogroupEntity>): Promise<InfogroupEntity | null> {
        return this.infogroupService.update(infogroup);
    }

    @Get(':id')
    async findById(@Param('id') id: number): Promise<InfogroupEntity | null> {
        return this.infogroupService.findById(id);
    }

    @Get()
    async findMany(): Promise<InfogroupEntity[] | null> {
        return this.infogroupService.findMany();
    }
} 