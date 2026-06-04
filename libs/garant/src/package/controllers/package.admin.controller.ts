import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Put,
    Query,
    NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PackageService } from '../services/package.service';
import { PackageCreateDto } from '../dto/package-create.dto';
import { PackageEntityDto } from '../dto/package-entity.dto';
import { PackageUpdateDto } from '../dto/package-update.dto';

@ApiTags('Admin Garant Package')
@Controller('admin/garant/packages')
export class AdminGarantPackageController {
    constructor(private readonly packageService: PackageService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новый пакет' })
    @ApiResponse({
        status: 201,
        description: 'Пакет успешно создан',
        type: PackageEntityDto,
    })
    async create(
        @Body() createPackageDto: PackageCreateDto,
    ): Promise<PackageCreateDto> {
        return this.packageService.create(createPackageDto);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все пакеты' })
    @ApiResponse({
        status: 200,
        description: 'Список всех пакетов',
        type: [PackageEntityDto],
    })
    async findAll(): Promise<PackageEntityDto[]> {
        return this.packageService.findAll();
    }

    @Get('code/:code')
    @ApiOperation({ summary: 'Получить пакет по коду' })
    @ApiResponse({
        status: 200,
        description: 'Пакет найден',
        type: PackageEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Пакет не найден',
    })
    async findByCode(@Param('code') code: string): Promise<PackageEntityDto> {
        const packageEntity = await this.packageService.findByCode(code);
        if (!packageEntity) {
            throw new NotFoundException('Package not found');
        }
        return packageEntity;
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить пакет по ID' })
    @ApiResponse({
        status: 200,
        description: 'Пакет найден',
        type: PackageEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Пакет не найден',
    })
    async findOne(@Param('id') id: string): Promise<PackageEntityDto> {
        return this.packageService.findById(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить пакет' })
    @ApiResponse({
        status: 200,
        description: 'Пакет успешно обновлен',
        type: PackageEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Пакет не найден',
    })
    async update(
        @Param('id') id: string,
        @Body() updatePackageDto: PackageUpdateDto,
    ): Promise<PackageEntityDto> {
        return this.packageService.update(id, updatePackageDto);
    }
}
