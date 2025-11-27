import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    HttpCode,
    HttpStatus,
    BadRequestException,
    UploadedFile,
    UseInterceptors,
    Res,
    NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { WordTemplateService } from '../services/word-template.service';
import { StorageService } from '../../../../core/storage/storage.service';
import {
    CreateWordTemplateRequestDto,
    CreateWordTemplateResponseDto,
} from '../dtos/create-word-template.dto';
import { UpdateWordTemplateDto } from '../dtos/update-word-template.dto';
import {
    WordTemplateIdParamsDto,
    WordTemplatePortalIdParamsDto,
    WordTemplateUserPortalParamsDto,
} from '../dtos/word-template-params.dto';
import { WordTemplateQueryDto } from '../dtos/find-all-word-template.dto';
import {
    WordTemplateDto,
    WordTemplateSummaryDto,
} from '../dtos/word-template.dto';

@ApiTags('Konstructor Word Template')
@Controller('word-templates')
export class WordTemplateController {
    constructor(
        private readonly wordTemplateService: WordTemplateService,
        private readonly storageService: StorageService,
    ) { }

    @ApiOperation({
        summary: 'Create word template',
        description: 'Create a new word template with DOCX file upload',
    })
    @ApiResponse({
        status: 201,
        description: 'Word template created successfully',
        type: CreateWordTemplateResponseDto,
    })
    @Post()
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        type: CreateWordTemplateRequestDto,
    })
    async createWordTemplate(
        @UploadedFile() file: Express.Multer.File,
        @Body() createDto: CreateWordTemplateRequestDto,
    ): Promise<CreateWordTemplateResponseDto> {
        try {
            const result = await this.wordTemplateService.create(createDto, file);
            return {
                id: String(result.id!), // Преобразуем BigInt в string
                name: result.name,
                visibility: result.visibility as any,
                is_default: result.is_default,
                file_path: result.file_path,
                demo_path: result.demo_path,
                type: result.type,
                code: result.code,
                tags: result.tags,
                is_active: result.is_active,
                counter: result.counter,
                template_url: result.template_url,
                created_at: result.created_at,
                updated_at: result.updated_at,
            };
        } catch (error) {
            console.error(error);
            throw new BadRequestException(error.message || 'Failed to create word template');
        }
    }

    @ApiOperation({
        summary: 'Get all word template summaries',
        description: 'Get all word template summaries with optional filters',
    })
    @ApiResponse({
        status: 200,
        description: 'List of word template summaries',
        type: [WordTemplateSummaryDto],
    })
    @Get()
    async findAllWordTemplates(
        @Query() query?: WordTemplateQueryDto,
    ): Promise<WordTemplateSummaryDto[]> {
        try {
            const filters: any = {};
            const { visibility, portal_id, is_active, search } = query || {};
            if (visibility) filters.visibility = visibility;
            if (portal_id) filters.portal_id = BigInt(portal_id);
            if (is_active !== undefined) filters.is_active = is_active === true;
            if (search) filters.search = search;

            const templates = await this.wordTemplateService.findMany(filters);
            return templates.map(t => ({
                id: String(t.id), // Преобразуем BigInt в string
                name: t.name,
                visibility: t.visibility as any,
                is_default: t.is_default,
                type: t.type,
                code: t.code,
                is_active: t.is_active,
                counter: t.counter,
                template_url: t.template_url,
                created_at: t.created_at,
            }));
        } catch (error) {
            console.error(error);
            throw new BadRequestException(error.message || 'Failed to get word templates');
        }
    }

    @ApiOperation({
        summary: 'Get public word templates',
        description: 'Get all public word templates',
    })
    @ApiResponse({
        status: 200,
        description: 'List of public word templates',
        type: [WordTemplateSummaryDto],
    })
    @Get('public')
    async findPublic(): Promise<WordTemplateSummaryDto[]> {
        const templates = await this.wordTemplateService.findPublic();
        return templates.map(t => ({
            id: String(t.id), // Преобразуем BigInt в string
            name: t.name,
            visibility: t.visibility as any,
            is_default: t.is_default,
            type: t.type,
            code: t.code,
            is_active: t.is_active,
            counter: t.counter,
            template_url: t.template_url,
            created_at: t.created_at,
        }));
    }

    @ApiOperation({
        summary: 'Get word templates by portal',
        description: 'Get all word templates for a specific portal',
    })
    @ApiResponse({
        status: 200,
        description: 'List of word templates for portal',
        type: [WordTemplateSummaryDto],
    })
    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: WordTemplatePortalIdParamsDto,
    ): Promise<WordTemplateSummaryDto[]> {
        const templates = await this.wordTemplateService.findByPortal(
            BigInt(params.portal_id),
        );
        return templates.map(t => ({
            id: String(t.id), // Преобразуем BigInt в string
            name: t.name,
            visibility: t.visibility as any,
            is_default: t.is_default,
            type: t.type,
            code: t.code,
            is_active: t.is_active,
            counter: t.counter,
            template_url: t.template_url,
            created_at: t.created_at,
        }));
    }

    @ApiOperation({
        summary: 'Get user word templates',
        description: 'Get all word templates available for a specific user in a portal',

    })
    @ApiResponse({
        status: 200,
        description: 'List of user word templates',
        type: [WordTemplateSummaryDto],
    })
    @Get('user/:user_id/portal/:portal_id')
    async findUserTemplates(
        @Param() params: WordTemplateUserPortalParamsDto,
    ): Promise<WordTemplateSummaryDto[]> {
        const templates = await this.wordTemplateService.findUserTemplates(
            BigInt(params.user_id),
            BigInt(params.portal_id),
        );
        return templates.map(t => ({
            id: String(t.id), // Преобразуем BigInt в string
            name: t.name,
            visibility: t.visibility as any,
            is_default: t.is_default,
            type: t.type,
            code: t.code,
            is_active: t.is_active,
            counter: t.counter,
            template_url: t.template_url,
            created_at: t.created_at,
        }));
    }

    @ApiOperation({
        summary: 'Get word template by id',
        description: 'Get word template by id',
    })
    @ApiResponse({
        status: 200,
        description: 'Word template details',
        type: WordTemplateDto,
    })
    @ApiOperation({
        summary: 'Get word template by id',
        description: 'Get word template by id',
    })
    @ApiResponse({
        status: 200,
        description: 'Word template details',
        type: WordTemplateDto,
    })
    @Get(':id')
    async findOne(
        @Param() params: WordTemplateIdParamsDto,
    ): Promise<WordTemplateDto> {
        const template = await this.wordTemplateService.findById(
            BigInt(params.id),
        );
        return template as WordTemplateDto;
    }

    @ApiOperation({
        summary: 'Download word template file',
        description: 'Download the DOCX template file by template ID',
    })
    @ApiResponse({
        status: 200,
        description: 'File download',
        content: {
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
                schema: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @Get(':id/download')
    async downloadTemplate(
        @Param() params: WordTemplateIdParamsDto,
        @Res() res: Response,
    ): Promise<void> {
        const template = await this.wordTemplateService.findById(
            BigInt(params.id),
        );

        if (!template.file_path) {
            throw new NotFoundException('Template file not found');
        }

        // Проверяем существование файла
        const fileExists = await this.storageService.fileExists(
            template.file_path,
        );

        if (!fileExists) {
            throw new NotFoundException('Template file not found in storage');
        }

        // Читаем файл
        const fileBuffer = await this.storageService.readFile(
            template.file_path,
        );

        // Очищаем имя файла от недопустимых символов для HTTP заголовков
        // Используем только безопасные ASCII символы
        const sanitizeFileName = (name: string): string => {
            if (!name) return 'template';
            // Оставляем только буквы, цифры, дефисы, подчеркивания и точки
            // Все остальное заменяем на подчеркивания
            const sanitized = name
                .replace(/[^a-zA-Z0-9\-_.]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '')
                .substring(0, 100) // Ограничиваем длину
                .trim();
            return sanitized || 'template';
        };

        const safeFileName = sanitizeFileName(template.name || 'template');
        const fileName = `${safeFileName}.docx`;

        // Устанавливаем заголовки для скачивания
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        );

        // Используем простой формат без кавычек (как в kpi-report)
        // Это самый безопасный вариант для HTTP заголовков
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${fileName}`,
        );

        // Отправляем файл
        res.send(fileBuffer);
    }

    @ApiOperation({
        summary: 'Update word template',
        description: 'Update word template (optionally upload new DOCX file)',
    })
    @ApiResponse({
        status: 200,
        description: 'Word template updated successfully',
        type: WordTemplateDto,
    })
    @Patch(':id')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        type: UpdateWordTemplateDto,
    })
    async update(
        @Param() params: WordTemplateIdParamsDto,
        @Body() updateDto: UpdateWordTemplateDto,
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<WordTemplateDto> {
        const template = await this.wordTemplateService.update(
            BigInt(params.id),
            updateDto,
            file,
        );
        return template as WordTemplateDto;
    }

    @ApiOperation({
        summary: 'Delete word template',
        description: 'Delete word template and its DOCX file',
    })
    @ApiResponse({
        status: 204,
        description: 'Word template deleted successfully',
    })
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    async remove(@Param() params: WordTemplateIdParamsDto): Promise<void> {
        return this.wordTemplateService.delete(BigInt(params.id));
    }

    @ApiOperation({
        summary: 'Set word template as active/inactive',
        description: 'Set word template active status',
    })
    @ApiResponse({
        status: 200,
        description: 'Word template active status updated',
        type: WordTemplateDto,
    })
    @Patch(':id/active')
    async setActiveWordTemplate(
        @Param() params: WordTemplateIdParamsDto,
        @Body('is_active') is_active: boolean,
    ): Promise<WordTemplateDto> {
        const template = await this.wordTemplateService.setActive(
            BigInt(params.id),
            is_active,
        );
        return template as WordTemplateDto;
    }

    @ApiOperation({
        summary: 'Set word template as default',
        description: 'Set word template as default template',
    })
    @ApiResponse({
        status: 200,
        description: 'Word template default status updated',
        type: WordTemplateDto,
    })
    @Patch(':id/default')
    async setDefault(
        @Param() params: WordTemplateIdParamsDto,
        @Body('is_default') is_default: boolean,
    ): Promise<WordTemplateDto> {
        const template = await this.wordTemplateService.setDefault(
            BigInt(params.id),
            is_default,
        );
        return template as WordTemplateDto;
    }
}

