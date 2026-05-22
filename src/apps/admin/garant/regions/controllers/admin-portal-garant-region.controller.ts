import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    BadRequestException,
    NotFoundException,
    Delete,
    Query,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiQuery,
    ApiBody,
} from '@nestjs/swagger';
import { PortalRegionService } from '../services/portal-region.service';
import { GetPortalRegionResponseDto } from '../dto/request/get-portal-region-response.dto';
import { CreatePortalRegionDtoAdminRequest } from '../dto/request/create-portal-region-request.dto';
import { UpdatePortalRegionDtoAdmin } from '../dto/request/update-portal-region-request.dto';

@ApiTags('Admin Portal Garant Region')
@Controller('admin/portal/garant/regions')
export class AdminPortalGarantRegionController {
    constructor(private readonly portalRegionService: PortalRegionService) {}

    @Get()
    @ApiQuery({
        name: 'portalId',
        type: Number,
        required: true,
        description: 'ID портала',
    })
    @ApiOperation({ summary: 'Получить все регионы' })
    @ApiResponse({
        status: 200,
        description: 'Список всех регионов',
        type: [GetPortalRegionResponseDto],
    })
    async list(
        @Query('portalId') portalId: number,
    ): Promise<GetPortalRegionResponseDto[] | null> {
        const regions =
            await this.portalRegionService.getPortalRegions(portalId);
        if (!regions) {
            throw new NotFoundException('Regions not found');
        }
        return regions;
    }
    @Post()
    @ApiBody({ type: CreatePortalRegionDtoAdminRequest })
    @ApiOperation({ summary: 'Создать регион для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно создан',
        type: GetPortalRegionResponseDto,
    })
    async create(
        @Body() dto: CreatePortalRegionDtoAdminRequest,
    ): Promise<GetPortalRegionResponseDto> {
        const region = await this.portalRegionService.createPortalRegion(dto);
        if (!region) {
            throw new BadRequestException('Region not created');
        }
        return new GetPortalRegionResponseDto(region, true);
    }

    @Get('update-initial-data/:portalId/:regionId')
    @ApiOperation({ summary: 'Получить регион для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно получен',
        type: UpdatePortalRegionDtoAdmin,
    })
    async getUpdateInitialData(
        @Param('portalId') portalId: number,
        @Param('regionId') regionId: number,
    ): Promise<UpdatePortalRegionDtoAdmin> {
        const region: UpdatePortalRegionDtoAdmin | null =
            await this.portalRegionService.getPortalRegionUpdateInitialData(
                portalId,
                regionId,
            );
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        return region;
    }

    @Put(':portalId/:regionId')
    @ApiBody({ type: UpdatePortalRegionDtoAdmin })
    @ApiOperation({ summary: 'Обновить регион для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно обновлен',
        type: GetPortalRegionResponseDto,
    })
    async update(
        @Param('portalId') portalId: number,
        @Param('regionId') regionId: number,
        @Body() dto: UpdatePortalRegionDtoAdmin,
    ): Promise<GetPortalRegionResponseDto> {
        console.log(dto);
        const region = await this.portalRegionService.updatePortalRegion(
            portalId,
            regionId,
            dto,
        );
        if (!region) {
            throw new BadRequestException('Region not updated');
        }
        return new GetPortalRegionResponseDto(region, true);
    }

    @Delete(':portalId/:regionId')
    @ApiOperation({ summary: 'Удалить регион для портала' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно удален',
        type: Boolean,
    })
    async delete(
        @Param('portalId') portalId: number,
        @Param('regionId') regionId: number,
    ): Promise<boolean> {
        return await this.portalRegionService.deletePortalRegion(
            portalId,
            regionId,
        );
    }
}
