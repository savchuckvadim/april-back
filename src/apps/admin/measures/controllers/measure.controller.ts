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
import { SuccessResponseDto, EResultCode } from '@/core';

@ApiTags('Admin Measures Management')
@Controller('admin/measures')
export class MeasureController {
    constructor(private readonly measureService: MeasureService) { }

    @ApiOperation({ summary: 'Create a new measure' })
    @ApiResponse({
        status: 201,
        description: 'Measure created successfully',
        type: MeasureResponseDto,
    })
    @Post()
    async createMeasure(@Body() createMeasureDto: CreateMeasureDto): Promise<SuccessResponseDto> {
        const measure = await this.measureService.create(createMeasureDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: measure,
        };
    }

    @ApiOperation({ summary: 'Get measure by ID' })
    @ApiResponse({
        status: 200,
        description: 'Measure found',
        type: MeasureResponseDto,
    })
    @Get(':id')
    async getMeasureById(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        const measure = await this.measureService.findById(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: measure,
        };
    }

    @ApiOperation({ summary: 'Get all measures' })
    @ApiResponse({
        status: 200,
        description: 'Measures found',
        type: [MeasureResponseDto],
    })
    @Get()
    async getAllMeasures(): Promise<SuccessResponseDto> {
        const measures = await this.measureService.findMany();
        return {
            resultCode: EResultCode.SUCCESS,
            data: measures,
        };
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
    ): Promise<SuccessResponseDto> {
        const measure = await this.measureService.update(id, updateMeasureDto);
        return {
            resultCode: EResultCode.SUCCESS,
            data: measure,
        };
    }

    @ApiOperation({ summary: 'Delete measure' })
    @ApiResponse({
        status: 200,
        description: 'Measure deleted successfully',
    })
    @Delete(':id')
    async deleteMeasure(@Param('id', ParseIntPipe) id: number): Promise<SuccessResponseDto> {
        await this.measureService.delete(id);
        return {
            resultCode: EResultCode.SUCCESS,
            data: null,
        };
    }
}

