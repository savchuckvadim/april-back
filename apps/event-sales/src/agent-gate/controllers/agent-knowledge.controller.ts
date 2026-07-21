import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import {
    KnowledgeContentService,
    KnowledgeStorageService,
    KnowledgeDocumentDto,
    KnowledgeDocumentContentDto,
} from '@lib/ai-rag';
import { KnowledgeListQueryDto } from '@lib/ai-rag/dto/knowledge-list-query.dto';
import { KnowledgeDocumentQueryDto } from '@lib/ai-rag/dto/knowledge-document-query.dto';
import { AGENT_API_KEY_HEADER, AgentKeyGuard } from '../guards/agent-key.guard';

/**
 * Agent API: RAG-материалы для скиллов внешнего агента — скрипты типов
 * звонков, методички Гарант, клиентские уточняющие документы портала.
 * Общая база + перекрытие по домену (storage/app/ai-rag/knowledge).
 */
@ApiTags('Agent API')
@ApiHeader({
    name: AGENT_API_KEY_HEADER,
    description: 'Ключ внешнего агента (env AGENT_API_KEYS).',
    required: true,
})
@UseGuards(AgentKeyGuard)
@Controller('agent/knowledge')
export class AgentKnowledgeController {
    constructor(
        private readonly knowledgeStorage: KnowledgeStorageService,
        private readonly knowledgeContent: KnowledgeContentService,
    ) {}

    @Get('kinds')
    @ApiOperation({
        summary: 'Типы материалов',
        description:
            'Имена kind-папок базы знаний (general + типы звонков/материалов).',
    })
    @ApiOkResponse({
        description: 'Массив имён kind-папок.',
        type: [String],
    })
    async listKinds(): Promise<string[]> {
        return this.knowledgeStorage.listKinds();
    }

    @Get()
    @ApiOperation({
        summary: 'Список материалов',
        description:
            'Документы для пары (domain?, kind): сначала общие general, затем kind. ' +
            'С domain — клиентская база портала, если она есть.',
    })
    @ApiOkResponse({
        description: 'Список документов (метаданные).',
        type: [KnowledgeDocumentDto],
    })
    async listDocuments(
        @Query() query: KnowledgeListQueryDto,
    ): Promise<KnowledgeDocumentDto[]> {
        const documents = await this.knowledgeStorage.listDocuments(
            query.domain,
            query.kind ?? 'general',
        );
        return documents.map(doc => KnowledgeDocumentDto.fromDocument(doc));
    }

    @Get('content')
    @ApiOperation({
        summary: 'Текст одного материала',
        description: 'Извлечённый текст конкретного документа базы знаний.',
    })
    @ApiOkResponse({
        description: 'Документ с извлечённым текстом.',
        type: KnowledgeDocumentContentDto,
    })
    async readDocument(
        @Query() query: KnowledgeDocumentQueryDto,
    ): Promise<KnowledgeDocumentContentDto> {
        const content = await this.knowledgeContent.readDocument(
            query.domain,
            query.kind,
            query.fileName,
        );
        return KnowledgeDocumentContentDto.fromContent(content);
    }

    @Get('all')
    @ApiOperation({
        summary: 'Тексты всех материалов типа',
        description:
            'Извлечённые тексты ВСЕХ документов пары (domain?, kind) одним запросом — ' +
            'готовый материал для скилла агента по типу звонка.',
    })
    @ApiOkResponse({
        description: 'Массив документов с текстами.',
        type: [KnowledgeDocumentContentDto],
    })
    async readAll(
        @Query() query: KnowledgeListQueryDto,
    ): Promise<KnowledgeDocumentContentDto[]> {
        const contents = await this.knowledgeContent.readAll(
            query.domain,
            query.kind ?? 'general',
        );
        return contents.map(content =>
            KnowledgeDocumentContentDto.fromContent(content),
        );
    }
}
