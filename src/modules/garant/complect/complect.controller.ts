import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ComplectService } from './services/complect.service';
import { ComplectEntity } from './complect.entity';
import { CreateComplectDto } from './dto/create-complect.dto';
import { InfoblockEntity, InfoblockLightEntity } from '../infoblock/infoblock.entity';

@ApiTags('Garant Complect')
@Controller('complect')
export class ComplectController {
    constructor(private readonly complectService: ComplectService) { }

    @Post()
    @ApiOperation({ summary: 'Создать новый комплект' })
    @ApiResponse({
        status: 201,
        description: 'Комплект успешно создан',
        type: ComplectEntity
    })
    async create(@Body() createComplectDto: CreateComplectDto): Promise<ComplectEntity | null> {
        return this.complectService.create(createComplectDto);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все комплекты' })
    @ApiResponse({
        status: 200,
        description: 'Список всех комплектов',
        type: [ComplectEntity]
    })
    async findAll(): Promise<ComplectEntity[] | null> {
        return this.complectService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить комплект по ID' })
    @ApiResponse({
        status: 200,
        description: 'Комплект найден',
        type: ComplectEntity
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден'
    })
    async findOne(@Param('id') id: string): Promise<ComplectEntity | null> {
        return this.complectService.findById(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить комплект' })
    @ApiResponse({
        status: 200,
        description: 'Комплект успешно обновлен',
        type: ComplectEntity
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден'
    })
    async update(
        @Param('id') id: string,
        @Body() updateComplectDto: CreateComplectDto
    ): Promise<ComplectEntity | null> {
        return this.complectService.update(id, updateComplectDto);
    }

    @Get('infoblocks/available/:id')
    @ApiOperation({ summary: 'Получить список доступных инфоблоков' })
    @ApiResponse({
        status: 200,
        description: 'Список доступных инфоблоков',
        type: [InfoblockLightEntity]
    })
    @ApiResponse({
        status: 404,
        description: 'Комплект не найден'
    })
    @ApiResponse({
        status: 404,
        description: 'Инфоблоки у комплекта не найдены'
    })
    async getAvailableInfoblocks(
        @Param('id') id: string
    ): Promise<InfoblockLightEntity[] | undefined> {
        return await this.complectService.getAvailableInfoblocks(id);
    }
} 