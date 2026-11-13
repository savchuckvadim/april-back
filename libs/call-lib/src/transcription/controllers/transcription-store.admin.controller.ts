import {
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { TranscriptionStoreService } from '../services/transcription.store.service';
import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { TranscriptionStoreDto } from '../dto/transcription.store.dto';
import {
    TranscriptionAdminFacetsDto,
    TranscriptionAdminPageDto,
    TranscriptionAdminPageQueryDto,
} from '../dto/transcription-admin-page.dto';
import { TranscriptionAdminPageService } from '../services/transcription-admin-page.service';

@ApiTags('Admin Transcription Store')
@Controller('admin/transcription-store')
export class AdminTranscriptionStoreController {
    constructor(
        private readonly transcriptionStoreService: TranscriptionStoreService,
        private readonly pageService: TranscriptionAdminPageService,
    ) {}

    // Маршруты page и facets — выше ':id', иначе Nest примет «page» за id.
    @ApiOperation({
        summary: 'Страница транскрипций с фильтрами',
        description:
            'Свежие первыми, без текста разговора; все фильтры — на сервере. Список админки ходит сюда, а не в выгрузку всех записей.',
    })
    @ApiOkResponse({ type: TranscriptionAdminPageDto })
    @Get('page')
    async findPage(
        @Query() query: TranscriptionAdminPageQueryDto,
    ): Promise<TranscriptionAdminPageDto> {
        return this.pageService.findPage(query);
    }

    @ApiOperation({
        summary: 'Значения фильтров списка транскрипций',
        description:
            'Порталы, распознаватели, статусы и приложения с числом записей — по всем порталам или по одному.',
    })
    @ApiQuery({
        name: 'domain',
        required: false,
        type: String,
        description: 'Домен портала — значения только по нему.',
        example: 'april-garant.bitrix24.ru',
    })
    @ApiOkResponse({ type: TranscriptionAdminFacetsDto })
    @Get('facets')
    async facets(
        @Query('domain') domain?: string,
    ): Promise<TranscriptionAdminFacetsDto> {
        return this.pageService.facets(domain || undefined);
    }

    @ApiOperation({ summary: 'Find transcription by ID' })
    @ApiResponse({
        status: 200,
        description: 'Transcription found successfully',
        type: TranscriptionStoreDto,
    })
    @Get(':id')
    async findById(@Param('id') id: string): Promise<TranscriptionStoreDto> {
        return this.transcriptionStoreService.findById(id);
    }

    @ApiOperation({ summary: 'Find all transcriptions' })
    @ApiResponse({
        status: 200,
        description: 'All transcriptions found successfully',
        type: [TranscriptionStoreDto],
    })
    @Get()
    async findAll(): Promise<TranscriptionStoreDto[]> {
        return this.transcriptionStoreService.findAll();
    }

    @ApiOperation({ summary: 'Find transcriptions by domain' })
    @ApiResponse({
        status: 200,
        description: 'Transcriptions found successfully',
        type: [TranscriptionStoreDto],
    })
    @Get('domain/:domain')
    async findByDomain(
        @Param('domain') domain: string,
    ): Promise<TranscriptionStoreDto[]> {
        return this.transcriptionStoreService.findByDomain(domain);
    }

    @ApiOperation({ summary: 'Find transcriptions by domain and user' })
    @ApiResponse({
        status: 200,
        description: 'Transcriptions found successfully',
        type: [TranscriptionStoreDto],
    })
    @Get('domain/:domain/user/:userId')
    async findByDomainAndUser(
        @Param('domain') domain: string,
        @Param('userId') userId: string,
    ): Promise<TranscriptionStoreDto[]> {
        return this.transcriptionStoreService.findByDomainAndUser(
            domain,
            userId,
        );
    }

    @ApiOperation({ summary: 'Delete transcription' })
    @ApiResponse({
        status: 200,
        description: 'Transcription deleted successfully',
        type: TranscriptionStoreDto,
    })
    @Delete(':id')
    async delete(@Param('id') id: string): Promise<boolean> {
        return await this.transcriptionStoreService.delete(id);
    }
}
