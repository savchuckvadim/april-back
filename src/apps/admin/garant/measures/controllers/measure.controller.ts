import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MeasureService } from '../services/measure.service';
import { CreateMeasureDto } from '../dto/create-measure.dto';
import { UpdateMeasureDto } from '../dto/update-measure.dto';
import { MeasureResponseDto } from '../dto/measure-response.dto';

@ApiTags('Admin Measures Management')
@Controller('admin/garant/measures')
export class AdminGarantMeasureController {
    constructor(private readonly measureService: MeasureService) {}

    @ApiOperation({ summary: 'Create a new measure' })
    @ApiResponse({
        status: 201,
        description: 'Measure created successfully',
        type: MeasureResponseDto,
    })
    @Post()
    async createMeasure(
        @Body() createMeasureDto: CreateMeasureDto,
    ): Promise<MeasureResponseDto> {
        const measure = await this.measureService.create(createMeasureDto);
        return measure;
    }

    @ApiOperation({ summary: 'Get measure by ID' })
    @ApiResponse({
        status: 200,
        description: 'Measure found',
        type: MeasureResponseDto,
    })
    @Get(':id')
    async getMeasureById(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<MeasureResponseDto> {
        const measure = await this.measureService.findById(id);
        return measure;
    }

    @ApiOperation({ summary: 'Get all measures' })
    @ApiResponse({
        status: 200,
        description: 'Measures found',
        type: [MeasureResponseDto],
    })
    @Get()
    async getAllMeasures(): Promise<MeasureResponseDto[]> {
        const measures = await this.measureService.findMany();
        return measures;
    }

    @ApiOperation({ summary: 'Update measure' })
    @ApiResponse({
        status: 200,
        description: 'Measure updated successfully',
        type: MeasureResponseDto,
    })
    @Put(':id')
    async updateMeasure(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateMeasureDto: UpdateMeasureDto,
    ): Promise<MeasureResponseDto> {
        const measure = await this.measureService.update(id, updateMeasureDto);
        return measure;
    }

    @ApiOperation({ summary: 'Delete measure' })
    @ApiResponse({
        status: 200,
        description: 'Measure deleted successfully',
    })
    @Delete(':id')
    async deleteMeasure(
        @Param('id', ParseIntPipe) id: number,
    ): Promise<boolean> {
        await this.measureService.delete(id);
        return true;
    }
}
