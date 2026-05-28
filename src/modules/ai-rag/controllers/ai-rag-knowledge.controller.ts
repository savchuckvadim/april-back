import {
    Body,
    Controller,
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
import { KnowledgeUploadParamsDto } from '../dto/knowledge-upload-params.dto';
import { KnowledgeUploadBodyDto } from '../dto/knowledge-upload-body.dto';
import { KnowledgeListQueryDto } from '../dto/knowledge-list-query.dto';
import { KnowledgeDocument } from '../domain/types/knowledge.type';
import { KnowledgeUploadResult } from '../infrastructure/knowledge/knowledge-storage.service';

@ApiTags('AI RAG Knowledge')
@Controller('ai-rag/knowledge')
export class AiRagKnowledgeController {
    constructor(private readonly knowledgeStorage: KnowledgeStorageService) {}

    @Get('kinds')
    @ApiOperation({
        summary:
            'Список доступных типов (папок) в общей базе знаний. ' +
            'Имена с точкой (домены) исключаются.',
    })
    @ApiOkResponse({
        description:
            'Массив имён kind-папок (например, general, resume, recomendation).',
        type: [String],
    })
    async listKinds(): Promise<string[]> {
        return this.knowledgeStorage.listKinds();
    }

    @Get()
    @ApiOperation({
        summary:
            'Список документов, которые сейчас попадут в RAG для пары ' +
            '(domain?, kind). Сначала general, затем kind.',
    })
    @ApiOkResponse({
        description:
            'Список документов с absolutePath, fileName, kind и source (shared или имя домена).',
    })
    async listDocuments(
        @Query() query: KnowledgeListQueryDto,
    ): Promise<KnowledgeDocument[]> {
        const kind = query.kind ?? 'general';
        return this.knowledgeStorage.listDocuments(query.domain, kind);
    }

    @Post(':kind')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary:
            'Загрузить документ в kind-папку. С domain — в клиентскую базу ' +
            'storage/app/ai-rag/knowledge/{domain}/{kind}/, без — в общую.',
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
    })
    async upload(
        @Param() params: KnowledgeUploadParamsDto,
        @Body() body: KnowledgeUploadBodyDto,
        @UploadedFile() file: Express.Multer.File,
    ): Promise<KnowledgeUploadResult> {
        return this.knowledgeStorage.saveDocument(
            { buffer: file.buffer, originalname: file.originalname },
            params.kind,
            body.domain,
        );
    }
}
