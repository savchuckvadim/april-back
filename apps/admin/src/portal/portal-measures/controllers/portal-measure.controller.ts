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
import { portal_measure } from 'generated/prisma';
import { PortalMeasureService } from '@lib/portal-lib/konstructor';
import { CreatePortalMeasureDto } from '../dto/create-portal-measure.dto';
import { UpdatePortalMeasureDto } from '../dto/update-portal-measure.dto';
import { PortalMeasureResponseDto } from '../dto/portal-measure-response.dto';
import { GetPortalMeasuresQueryDto } from '../dto/get-portal-measures-query.dto';

@ApiTags('Admin Portal Measures Management')
@Controller('admin/pbx/portal-measures')
export class PortalMeasureController {
    constructor(private readonly portalMeasureService: PortalMeasureService) {}

    @ApiOperation({ summary: 'Create a new portal measure' })
    @ApiResponse({
        status: 201,
        description: 'Portal measure created successfully',
        type: PortalMeasureResponseDto,
    })
    @Post()
    async createPortalMeasure(
        @Body() createPortalMeasureDto: CreatePortalMeasureDto,
    ): Promise<PortalMeasureResponseDto> {
        const portalMeasure = await this.portalMeasureService.create({
            measure_id: BigInt(createPortalMeasureDto.measure_id),
            portal_id: BigInt(createPortalMeasureDto.portal_id),
            bitrixId: createPortalMeasureDto.bitrixId,
            name: createPortalMeasureDto.name,
            shortName: createPortalMeasureDto.shortName,
            fullName: createPortalMeasureDto.fullName,
        });
        return this.mapToResponseDto(portalMeasure);
    }

    @ApiOperation({ summary: 'Get portal measure by ID' })
    @ApiResponse({
        status: 200,
        description: 'Portal measure found',
        type: PortalMeasureResponseDto,
    })
    @Get(':id')
    async getPortalMeasureById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<PortalMeasureResponseDto> {
        const portalMeasure = await this.portalMeasureService.findById(id);
        return this.mapToResponseDto(portalMeasure);
    }

    @ApiOperation({ summary: 'Get all portal measures' })
    @ApiResponse({
        status: 200,
        description: 'Portal measures found',
        type: [PortalMeasureResponseDto],
    })
    @Get()
    async getAllPortalMeasures(
        @Query() query: GetPortalMeasuresQueryDto,
    ): Promise<PortalMeasureResponseDto[]> {
        const { portalId, measureId } = query;
        let portalMeasures: portal_measure[];
        if (portalId) {
            portalMeasures = await this.portalMeasureService.findByPortalId(
                Number(portalId),
            );
        } else if (measureId) {
            portalMeasures = await this.portalMeasureService.findByMeasureId(
                Number(measureId),
            );
        } else {
            portalMeasures = await this.portalMeasureService.findMany();
        }

        return portalMeasures.map(m => this.mapToResponseDto(m));
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
    ): Promise<PortalMeasureResponseDto> {
        const portalMeasure = await this.portalMeasureService.update(id, {
            measure_id:
                updatePortalMeasureDto.measure_id !== undefined
                    ? BigInt(updatePortalMeasureDto.measure_id)
                    : undefined,
            portal_id:
                updatePortalMeasureDto.portal_id !== undefined
                    ? BigInt(updatePortalMeasureDto.portal_id)
                    : undefined,
            bitrixId: updatePortalMeasureDto.bitrixId,
            name: updatePortalMeasureDto.name,
            shortName: updatePortalMeasureDto.shortName,
            fullName: updatePortalMeasureDto.fullName,
        });
        return this.mapToResponseDto(portalMeasure);
    }

    @ApiOperation({ summary: 'Delete portal measure' })
    @ApiResponse({
        status: 200,
        description: 'Portal measure deleted successfully',
    })
    @Delete(':id')
    async deletePortalMeasure(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<boolean> {
        await this.portalMeasureService.delete(id);
        return true;
    }

    private mapToResponseDto(
        portalMeasure: portal_measure,
    ): PortalMeasureResponseDto {
        return {
            id: Number(portalMeasure.id),
            measure_id: Number(portalMeasure.measure_id),
            portal_id: Number(portalMeasure.portal_id),
            bitrixId: portalMeasure.bitrixId,
            name: portalMeasure.name,
            shortName: portalMeasure.shortName,
            fullName: portalMeasure.fullName,
            created_at: portalMeasure.created_at,
            updated_at: portalMeasure.updated_at,
        };
    }
}
