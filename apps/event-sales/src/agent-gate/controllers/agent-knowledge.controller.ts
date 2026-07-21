import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBody,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    KnowledgeContentService,
    KnowledgeStorageService,
    KnowledgeDocumentDto,
    KnowledgeDocumentContentDto,
    KnowledgeUploadResponseDto,
} from '@lib/ai-rag';
import { KnowledgeListQueryDto } from '@lib/ai-rag/dto/knowledge-list-query.dto';
import { KnowledgeDocumentQueryDto } from '@lib/ai-rag/dto/knowledge-document-query.dto';
import { KnowledgeUploadParamsDto } from '@lib/ai-rag/dto/knowledge-upload-params.dto';
import { AgentKnowledgeUploadDto } from '../dto/agent-knowledge-upload.dto';
import {
    AGENT_API_KEY_HEADER,
    AgentKeyGuard,
    AgentRequest,
} from '../guards/agent-key.guard';

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

    /** Изоляция порталов: клиентская база чужого домена недоступна ключу. */
    private assertDomainAllowed(
        domain: string | undefined,
        request: AgentRequest,
    ): void {
        if (!domain || !request.agentDomains) return;
        if (!request.agentDomains.includes(domain.toLowerCase())) {
            throw new ForbiddenException(
                'Домен вне разрешённых для этого ключа агента',
            );
        }
    }

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
        @Req() request: AgentRequest,
    ): Promise<KnowledgeDocumentDto[]> {
        this.assertDomainAllowed(query.domain, request);
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
        @Req() request: AgentRequest,
    ): Promise<KnowledgeDocumentContentDto> {
        this.assertDomainAllowed(query.domain, request);
        const content = await this.knowledgeContent.readDocument(
            query.domain,
            query.kind,
            query.fileName,
        );
        return KnowledgeDocumentContentDto.fromContent(content);
    }

    @Post(':kind')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Записать текстовый документ',
        description:
            'Накопительные материалы агента (профили менеджеров kind=managers, ' +
            'выжимки, библиотеки ответов): текст в .md/.txt/.json, перезапись ' +
            'допустима. Ключ с доменной изоляцией пишет ТОЛЬКО в свою клиентскую ' +
            'базу (domain обязателен); общая база — только ключу без ограничений.',
    })
    @ApiParam({
        name: 'kind',
        description: 'Kind-папка назначения (например managers).',
        example: 'managers',
        type: String,
    })
    @ApiBody({
        type: AgentKnowledgeUploadDto,
        description: 'Имя файла, текстовое содержимое и домен.',
    })
    @ApiOkResponse({
        description: 'Метаданные сохранённого документа.',
        type: KnowledgeUploadResponseDto,
    })
    async uploadText(
        @Param() params: KnowledgeUploadParamsDto,
        @Body() body: AgentKnowledgeUploadDto,
        @Req() request: AgentRequest,
    ): Promise<KnowledgeUploadResponseDto> {
        if (request.agentDomains && !body.domain) {
            throw new ForbiddenException(
                'Ключ с доменной изоляцией обязан указывать domain (запись в общую базу запрещена)',
            );
        }
        this.assertDomainAllowed(body.domain, request);
        const result = await this.knowledgeStorage.saveDocument(
            {
                buffer: Buffer.from(body.content, 'utf8'),
                originalname: body.fileName,
            },
            params.kind,
            body.domain,
        );
        return {
            fileName: result.fileName,
            kind: result.kind,
            source: result.source,
        };
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
        @Req() request: AgentRequest,
    ): Promise<KnowledgeDocumentContentDto[]> {
        this.assertDomainAllowed(query.domain, request);
        const contents = await this.knowledgeContent.readAll(
            query.domain,
            query.kind ?? 'general',
        );
        return contents.map(content =>
            KnowledgeDocumentContentDto.fromContent(content),
        );
    }
}
