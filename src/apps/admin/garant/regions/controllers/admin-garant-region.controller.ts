import { CreateRegionDto, RegionEntity, RegionService } from '@/modules/garant';
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetRegionResponseDto } from '../dto/request/get-region-response.dto';

@ApiTags('Admin Garant Region')
@Controller('admin/garant/regions')
export class AdminGarantRegionController {
    constructor(private readonly regionService: RegionService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новый регион' })
    @ApiResponse({
        status: 201,
        description: 'Регион успешно создан',
        type: GetRegionResponseDto,
    })
    async create(
        @Body() createRegionDto: CreateRegionDto,
    ): Promise<GetRegionResponseDto | null> {
        const region = await this.regionService.create(createRegionDto);
        if (!region) {
            throw new BadRequestException('Region not created');
        }
        return new GetRegionResponseDto(region);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все регионы' })
    @ApiResponse({
        status: 200,
        description: 'Список всех регионов',
        type: [GetRegionResponseDto],
    })
    async findAll(): Promise<GetRegionResponseDto[] | null> {
        const regions = await this.regionService.findAll();
        if (!regions) {
            throw new NotFoundException('Regions not found');
        }
        return regions.map(region => new GetRegionResponseDto(region));
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить регион по ID' })
    @ApiResponse({
        status: 200,
        description: 'Регион найден',
        type: GetRegionResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Регион не найден',
    })
    async findOne(
        @Param('id') id: string,
    ): Promise<GetRegionResponseDto | null> {
        const region = await this.regionService.findById(id);
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        return new GetRegionResponseDto(region);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить регион' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно обновлен',
        type: GetRegionResponseDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Регион не найден',
    })
    async update(
        @Param('id') id: string,
        @Body() updateRegionDto: CreateRegionDto,
    ): Promise<GetRegionResponseDto | null> {
        const region = await this.regionService.update({
            id,
            ...updateRegionDto,
        });
        if (!region) {
            throw new NotFoundException('Region not updated');
        }
        return new GetRegionResponseDto(region);
    }

    @Post('update-from-excel')
    @ApiOperation({ summary: 'Обновить регионы из Excel файла' })
    @ApiResponse({
        status: 200,
        description: 'Регионы успешно обновлены',
        type: [GetRegionResponseDto],
    })
    async updateFromExcel(): Promise<GetRegionResponseDto[] | null> {
        const regions = await this.regionService.updateFromExcel();
        if (!regions) {
            throw new NotFoundException('Regions not updated');
        }
        return regions.map(region => new GetRegionResponseDto(region));
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Удалить регион' })
    @ApiResponse({
        status: 200,
        description: 'Регион успешно удален',
        type: Boolean,
    })
    @ApiResponse({
        status: 404,
        description: 'Регион не найден',
    })
    async delete(@Param('id') id: string): Promise<boolean> {
        const region = await this.regionService.delete(id);
        if (!region) {
            throw new NotFoundException('Region not found');
        }
        return true;
    }
}
