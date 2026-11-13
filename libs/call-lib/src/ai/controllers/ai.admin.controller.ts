import { Controller, Get, Post, Body, Param, Put, Query } from '@nestjs/common';
import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import {
    AiAdminFacetsDto,
    AiAdminPageDto,
    AiAdminPageQueryDto,
} from '../dto/ai-admin-page.dto';
import { AiAdminPageService } from '../services/ai-admin-page.service';
import { AiService } from '../services/ai.service';
import { AiCreateDto } from '../dto/ai-create.dto';
import { AiEntityDto } from '../dto/ai-entity.dto';
import { AiUpdateDto } from '../dto/ai-update.dto';

@ApiTags('Admin AI')
@Controller('admin/ai')
export class AdminAiController {
    constructor(
        private readonly aiService: AiService,
        private readonly pageService: AiAdminPageService,
    ) {}

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

    // Объявлен до ':id', иначе 'page' уйдёт в поиск записи по id.
    @Get('page')
    @ApiOperation({
        summary: 'Страница AI-записей',
        description:
            'Свежие первыми, общее число под фильтром; все фильтры — на сервере. ' +
            'Длинные поля укорочены. Для списка админки вместо выгрузки всех записей.',
    })
    @ApiOkResponse({ type: AiAdminPageDto })
    async findPage(
        @Query() query: AiAdminPageQueryDto,
    ): Promise<AiAdminPageDto> {
        return this.pageService.findPage(query);
    }

    @Get('facets')
    @ApiOperation({
        summary: 'Значения фильтров списка AI-записей',
        description:
            'Порталы, типы, поставщики и статусы с числом записей — по всем порталам или по одному.',
    })
    @ApiQuery({
        name: 'domain',
        required: false,
        type: String,
        description: 'Домен портала — значения только по нему.',
        example: 'april-garant.bitrix24.ru',
    })
    @ApiOkResponse({ type: AiAdminFacetsDto })
    async facets(@Query('domain') domain?: string): Promise<AiAdminFacetsDto> {
        return this.pageService.facets(domain || undefined);
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
