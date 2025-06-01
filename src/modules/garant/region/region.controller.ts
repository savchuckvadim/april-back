import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionService } from './region.service';
import { RegionEntity } from './region.entity';
import { CreateRegionDto } from './dto/create-region.dto';

@ApiTags('Garant Region')
@Controller('region')
export class RegionController {
    constructor(private readonly regionService: RegionService) { }

    @Post()
    @ApiOperation({ summary: 'Создать новый регион' })
    @ApiResponse({
        status: 201,
        description: 'Регион успешно создан',
        type: RegionEntity
    })
    async create(@Body() createRegionDto: CreateRegionDto): Promise<RegionEntity | null> {
        return this.regionService.create(createRegionDto);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все регионы' })
    @ApiResponse({
        status: 200,
        description: 'Список всех регионов',
        type: [RegionEntity]
    })
    async findAll(): Promise<RegionEntity[] | null> {
        return this.regionService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить регион по ID' })
    @ApiResponse({
        status: 200,
        description: 'Регион найден',
        type: RegionEntity
    })
    @ApiResponse({
        status: 404,
        description: 'Регион не найден'
    })
    async findOne(@Param('id') id: string): Promise<RegionEntity | null> {
        return this.regionService.findById(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить регион' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно обновлен',
        type: RegionEntity
    })
    @ApiResponse({
        status: 404,
        description: 'Регион не найден'
    })
    async update(
        @Param('id') id: string,
        @Body() updateRegionDto: CreateRegionDto
    ): Promise<RegionEntity | null> {
        return this.regionService.update({ id, ...updateRegionDto });
    }

    @Post('update-from-excel')
    @ApiOperation({ summary: 'Обновить регионы из Excel файла' })
    @ApiResponse({
        status: 200,
        description: 'Регионы успешно обновлены',
        type: [RegionEntity]
    })
    async updateFromExcel(): Promise<RegionEntity[] | null> {
        return this.regionService.updateFromExcel();
    }
} 