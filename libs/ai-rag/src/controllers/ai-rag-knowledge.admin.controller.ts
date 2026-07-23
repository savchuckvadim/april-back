import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { KnowledgeStorageService } from '../infrastructure/knowledge/knowledge-storage.service';
import { KnowledgeContentService } from '../application/knowledge-content.service';
import { KnowledgeUploadParamsDto } from '../dto/knowledge-upload-params.dto';
import { KnowledgeUploadBodyDto } from '../dto/knowledge-upload-body.dto';
import { KnowledgeListQueryDto } from '../dto/knowledge-list-query.dto';
import { KnowledgeDocumentQueryDto } from '../dto/knowledge-document-query.dto';
import { KnowledgeTextUpsertDto } from '../dto/knowledge-text-upsert.dto';
import { KNOWN_KNOWLEDGE_KINDS } from '../domain/types/knowledge-kind-registry';
import {
    KnowledgeDeleteResponseDto,
    KnowledgeDocumentContentDto,
    KnowledgeDocumentDto,
    KnowledgeKindInfoDto,
    KnowledgeUploadResponseDto,
} from '../dto/knowledge-response.dto';

/**
 * Админ-управление базой знаний RAG: документы для общей базы и для
 * конкретных порталов (скрипты типов звонков, материалы Гарант и т.п.).
 * Хостится ТОЛЬКО в apps/admin (см. AiRagAdminModule) — в Swagger
 * прикладных приложений эти роуты не попадают.
 */
@ApiTags('Admin AI RAG Knowledge')
@Controller('admin/ai-rag/knowledge')
export class AiRagKnowledgeAdminController {
    constructor(
        private readonly knowledgeStorage: KnowledgeStorageService,
        private readonly knowledgeContent: KnowledgeContentService,
    ) {}

    @Get('kinds')
    @ApiOperation({
        summary: 'Реестр kind-разделов базы знаний',
        description:
            'Известные kind (реестр с названиями/описаниями/потребителями) + ' +
            'фактические папки общей базы. Нестандартные папки помечаются ' +
            'known=false. Основа экрана «Материалы» в админке.',
    })
    @ApiOkResponse({
        description: 'Реестр kind с описаниями.',
        type: [KnowledgeKindInfoDto],
    })
    async listKinds(): Promise<KnowledgeKindInfoDto[]> {
        const existing = new Set(await this.knowledgeStorage.listKinds());
        const result: KnowledgeKindInfoDto[] = KNOWN_KNOWLEDGE_KINDS.map(
            info => ({
                ...info,
                known: true,
                hasSharedDocuments: existing.has(info.kind),
            }),
        );
        for (const kind of existing) {
            if (KNOWN_KNOWLEDGE_KINDS.some(info => info.kind === kind)) {
                continue;
            }
            result.push({
                kind,
                title: kind,
                description: 'Нестандартный kind (создан загрузкой документа).',
                consumer: 'неизвестно',
                known: false,
                hasSharedDocuments: true,
            });
        }
        return result;
    }

    @Post(':kind/text')
    @ApiOperation({
        summary: 'Сохранить текстовый документ (редактор)',
        description:
            'Сохраняет/перезаписывает документ из текста без multipart — для ' +
            'редактора инструкций в админке. С domain — в клиентскую базу ' +
            '(перекрывает общую), без — в общую.',
    })
    @ApiBody({ type: KnowledgeTextUpsertDto })
    @ApiOkResponse({
        description: 'Метаданные сохранённого документа.',
        type: KnowledgeUploadResponseDto,
    })
    async upsertText(
        @Param() params: KnowledgeUploadParamsDto,
        @Body() body: KnowledgeTextUpsertDto,
    ): Promise<KnowledgeUploadResponseDto> {
        const result = await this.knowledgeStorage.saveTextDocument(
            params.kind,
            body.fileName,
            body.content,
            body.domain,
        );
        return {
            fileName: result.fileName,
            kind: result.kind,
            source: result.source,
        };
    }

    @Get('domains')
    @ApiOperation({
        summary: 'Список доменов с клиентской базой',
        description:
            'Домены порталов, у которых есть собственная папка базы знаний.',
    })
    @ApiOkResponse({
        description: 'Массив доменов порталов.',
        type: [String],
    })
    async listDomains(): Promise<string[]> {
        return this.knowledgeStorage.listDomains();
    }

    @Get()
    @ApiOperation({
        summary: 'Список документов',
        description:
            'Документы, которые попадут в RAG для пары (domain?, kind): сначала general, затем kind.',
    })
    @ApiOkResponse({
        description: 'Список документов базы знаний.',
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
        summary: 'Текст документа',
        description:
            'Возвращает извлечённый текст конкретного документа базы знаний.',
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

    @Post(':kind')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить документ',
        description:
            'Загружает документ в kind-папку: с domain — в клиентскую базу портала, без — в общую.',
    })
    @ApiBody({
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                    description: 'PDF / DOCX / XLSX / TXT / MD.',
                },
                domain: {
                    type: 'string',
                    description:
                        'Домен портала. Без него документ попадёт в общую базу.',
                },
            },
        },
    })
    @ApiOkResponse({
        description: 'Метаданные сохранённого документа.',
        type: KnowledgeUploadResponseDto,
    })
    async upload(
        @Param() params: KnowledgeUploadParamsDto,
        @Body() body: KnowledgeUploadBodyDto,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<KnowledgeUploadResponseDto> {
        const result = await this.knowledgeStorage.saveDocument(
            { buffer: file.buffer, originalname: file.originalname },
            params.kind,
            body.domain,
        );
        return {
            fileName: result.fileName,
            kind: result.kind,
            source: result.source,
        };
    }

    @Delete()
    @ApiOperation({
        summary: 'Удалить документ',
        description:
            'Удаляет документ строго из указанной базы (клиентской при заданном domain, иначе общей).',
    })
    @ApiOkResponse({
        description: 'Результат удаления.',
        type: KnowledgeDeleteResponseDto,
    })
    async deleteDocument(
        @Query() query: KnowledgeDocumentQueryDto,
    ): Promise<KnowledgeDeleteResponseDto> {
        await this.knowledgeStorage.deleteDocument(
            query.domain,
            query.kind,
            query.fileName,
        );
        return { success: true, fileName: query.fileName };
    }
}
