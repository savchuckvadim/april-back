import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PortalRegionService } from "./portal-region.service";
import { RegionEntity } from "../region.entity";
import { CreatePortalRegionDto, DeletePortalRegionDto, UpdatePortalRegionDto } from "./dto/portal-region.dto";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";

@ApiTags('Garant Region')
@Controller('portal-region')
export class PortalRegionController {
    constructor(
        private readonly portalRegionService: PortalRegionService
    ) { }

    @ApiOperation({ summary: 'Получить регионы для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регионы успешно получены',
        type: RegionEntity,
        isArray: true
    })
    @ApiParam({
        name: 'domain',
        description: 'Domain of the Bitrix24 portal',
        example: 'april-dev.bitrix24.ru',
        required: true
    })
    @Get(':domain')
    async getPortalRegions(@Param('domain') domain: string): Promise<RegionEntity[] | null> {
        return await this.portalRegionService.getPortalRegions(domain);
    }


    @ApiOperation({ summary: 'Создать регион для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно создан',
        type: RegionEntity,
        isArray: true
    })
    @Post('add')
    async createPortalRegion(@Body() dto: CreatePortalRegionDto): Promise<RegionEntity[] | null> {
        return await this.portalRegionService.createPortalRegion(dto);
    }

    @ApiOperation({ summary: 'Обновить AB, налог, налог_abs для региона для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно обновлен',
        type: RegionEntity,
        isArray: true
    })
    @Post('update')
    async updatePortalRegion(@Body() dto: UpdatePortalRegionDto): Promise<RegionEntity[] | null> {
        return await this.portalRegionService.updatePortalRegion(dto);
    }

    @ApiOperation({ summary: 'Удалить регион для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно удален',
        type: RegionEntity,
        isArray: true
    })
    @Post('delete') 
    async deletePortalRegion(@Body() dto: DeletePortalRegionDto): Promise<RegionEntity[] | null> {
        return await this.portalRegionService.deletePortalRegion(dto);
    }
}