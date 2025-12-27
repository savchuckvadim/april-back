import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PortalMeasureService } from '../services/portal-measure.service';
import { CreatePortalMeasureDto } from '../dto/create-portal-measure.dto';
import { UpdatePortalMeasureDto } from '../dto/update-portal-measure.dto';
import { PortalMeasureResponseDto } from '../dto/portal-measure-response.dto';
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Portal Measures Management')
@Controller('admin/portals/portal-measures')
export class PortalMeasureController {
    constructor(private readonly portalMeasureService: PortalMeasureService) { }

    @ApiOperation({ summary: 'Create a new portal measure' })
    @ApiResponse({
        status: 201,
        description: 'Portal measure created successfully',
        type: PortalMeasureResponseDto,
    })
    @Post()
    async createPortalMeasure(@Body() createPortalMeasureDto: CreatePortalMeasureDto): Promise<SuccessResponseDto> {
        const portalMeasure = await this.portalMeasureService.create(createPortalMeasureDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portalMeasure,
        };
    }

    @ApiOperation({ summary: 'Get portal measure by ID' })
    @ApiResponse({
        status: 200,
        description: 'Portal measure found',
        type: PortalMeasureResponseDto,
    })
    @Get(':id')
    async getPortalMeasureById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const portalMeasure = await this.portalMeasureService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portalMeasure,
        };
    }

    @ApiOperation({ summary: 'Get all portal measures' })
    @ApiResponse({
        status: 200,
        description: 'Portal measures found',
        type: [PortalMeasureResponseDto],
    })
    @Get()
    async getAllPortalMeasures(
        @Query('portal_id') portalId?: string,
        @Query('measure_id') measureId?: string,
    ): Promise<SuccessResponseDto> {
        let portalMeasures;
        if (portalId) {
            portalMeasures = await this.portalMeasureService.findByPortalId(Number(portalId));
        } else if (measureId) {
            portalMeasures = await this.portalMeasureService.findByMeasureId(Number(measureId));
        } else {
            portalMeasures = await this.portalMeasureService.findMany();
        }

        return {
            resultCode: EResultCode.SUCCESS,
            data: portalMeasures,
        };
    }

    @ApiOperation({ summary: 'Update portal measure' })
    @ApiResponse({
        status: 200,
        description: 'Portal measure updated successfully',
        type: PortalMeasureResponseDto,
    })
    @Put(':id')
    async updatePortalMeasure(
        @Param('id', ParseIntPipe) id: number,
        @Body() updatePortalMeasureDto: UpdatePortalMeasureDto,
    ): Promise<SuccessResponseDto> {
        const portalMeasure = await this.portalMeasureService.update(id, updatePortalMeasureDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: portalMeasure,
        };
    }

    @ApiOperation({ summary: 'Delete portal measure' })
    @ApiResponse({
        status: 200,
        description: 'Portal measure deleted successfully',
    })
    @Delete(':id')
    async deletePortalMeasure(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.portalMeasureService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

