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
import {
    KnowledgeDeleteResponseDto,
    KnowledgeDocumentContentDto,
    KnowledgeDocumentDto,
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
        summary: 'Список kind-папок',
        description:
            'Возвращает имена kind-папок общей базы знаний (типы звонков и материалов).',
    })
    @ApiOkResponse({
        description: 'Массив имён kind-папок.',
        type: [String],
    })
    async listKinds(): Promise<string[]> {
        return this.knowledgeStorage.listKinds();
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
