import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from '../services/ai.service';
import { AiCreateDto } from '../dto/ai-create.dto';
import { AiEntityDto } from '../dto/ai-entity.dto';
import { AiUpdateDto } from '../dto/ai-update.dto';

@ApiTags('Admin AI')
@Controller('admin/ai')
export class AdminAiController {
    constructor(private readonly aiService: AiService) {}

    @Post()
    @ApiOperation({ summary: 'Создать новую запись AI' })
    @ApiResponse({
        status: 201,
        description: 'Запись AI успешно создана',
        type: AiEntityDto,
    })
    async create(@Body() createAiDto: AiCreateDto): Promise<AiEntityDto> {
        return this.aiService.create(createAiDto);
    }

    @Get()
    @ApiOperation({ summary: 'Получить все записи AI' })
    @ApiResponse({
        status: 200,
        description: 'Список всех записей AI',
        type: [AiEntityDto],
    })
    async findAll(): Promise<AiEntityDto[]> {
        return this.aiService.findAll();
    }

    @Get('domain/:domain/user/:userId')
    @ApiOperation({ summary: 'Получить записи AI по домену и пользователю' })
    @ApiResponse({
        status: 200,
        description: 'Список записей AI по домену и пользователю',
        type: [AiEntityDto],
    })
    async findByDomainAndUser(
        @Param('domain') domain: string,
        @Param('userId') userId: string,
    ): Promise<AiEntityDto[]> {
        return this.aiService.findByDomainAndUser(domain, userId);
    }

    @Get('domain/:domain')
    @ApiOperation({ summary: 'Получить записи AI по домену' })
    @ApiResponse({
        status: 200,
        description: 'Список записей AI по домену',
        type: [AiEntityDto],
    })
    async findByDomain(
        @Param('domain') domain: string,
    ): Promise<AiEntityDto[]> {
        return this.aiService.findByDomain(domain);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Получить запись AI по ID' })
    @ApiResponse({
        status: 200,
        description: 'Запись AI найдена',
        type: AiEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Запись AI не найдена',
    })
    async findOne(@Param('id') id: string): Promise<AiEntityDto> {
        return this.aiService.findById(id);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Обновить запись AI' })
    @ApiResponse({
        status: 200,
        description: 'Запись AI успешно обновлена',
        type: AiEntityDto,
    })
    @ApiResponse({
        status: 404,
        description: 'Запись AI не найдена',
    })
    async update(
        @Param('id') id: string,
        @Body() updateAiDto: AiUpdateDto,
    ): Promise<AiEntityDto> {
        return this.aiService.update(id, updateAiDto);
    }
}
