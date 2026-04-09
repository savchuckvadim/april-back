import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    Query,
    UploadedFile,
    UseInterceptors,
    Res,
    Put,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
    ApiOperation,
    ApiResponse,
    ApiTags,
    ApiConsumes,
    ApiBody,
    ApiProduces,
} from '@nestjs/swagger';
import { WordTemplateService } from '../services/word-template.service';
import { DownloadTemplateService } from '../services/download-template.service';
import {
    CreateWordTemplateBodyDto,
    CreateWordTemplateMultipartDto,
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
    UserSelectedTemplateSummaryDto,
    WordTemplateDto,
    WordTemplateSummaryDto,
} from '../dtos/word-template.dto';
import { randomUUID } from 'crypto';
import { OfferTemplateVisibility } from '../../offer-template';

/**
 * set default
 * default может установить для шаблонов public только суперюзер
 * с пометкой is_default: true может быть только один шаблон в группе
 *
 *  default может установить для шаблонов portal любой user
 *

 */
@ApiTags('Konstructor Word Template')
@Controller('word-templates')
export class WordTemplateController {
    constructor(
        private readonly wordTemplateService: WordTemplateService,
        private readonly downloadTemplateService: DownloadTemplateService,
    ) {}

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
        type: CreateWordTemplateMultipartDto,
    })
    async createWordTemplate(
        @UploadedFile() file: Express.Multer.File,
        @Body() createDto: CreateWordTemplateBodyDto,
    ): Promise<CreateWordTemplateResponseDto> {
        const uuid = randomUUID();

        const code = `offer-word-${uuid}`;
        return await this.wordTemplateService.create(
            {
                ...createDto,
                code,
            },
            file,
        );
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
        const filters: Partial<WordTemplateQueryDto> = {};
        const { visibility, portal_id, is_active, search } = query || {};
        if (visibility) filters.visibility = visibility;
        if (portal_id) filters.portal_id = portal_id;
        if (is_active !== undefined) filters.is_active = is_active === true;
        if (search) filters.search = search;

        const templates = await this.wordTemplateService.findMany(filters);
        return templates.map(t => new WordTemplateSummaryDto(t));
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
        return templates;
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
        const templates = await this.wordTemplateService.findPortalTemplates(
            BigInt(params.portal_id),
        );
        return templates;
    }

    @ApiOperation({
        summary: 'Get user word templates',
        description:
            'Get all word templates available for a specific user in a portal',
    })
    @ApiResponse({
        status: 200,
        description: 'List of user word templates',
        type: [WordTemplateSummaryDto],
    })
    @Get('user/:user_id/portal/:portal_id')
    async findUserTemplates(
        @Param() params: WordTemplateUserPortalParamsDto,
    ): Promise<{
        templates: WordTemplateSummaryDto[];
        selected: UserSelectedTemplateSummaryDto[];
    }> {
        const templates = await this.wordTemplateService.findUserTemplates(
            BigInt(params.user_id),
            BigInt(params.portal_id),
        );
        const result = {
            templates: templates.templates.map(t => ({
                id: String(t.id), // Преобразуем BigInt в string
                name: t.name,
                visibility: t.visibility as OfferTemplateVisibility,
                is_default: t.is_default,
                type: t.type,
                code: t.code,
                is_active: t.is_active,
                is_archived: t.is_archived,
                user_id: t.user_id,
                counter: t.counter,
                template_url: t.template_url,
                created_at: t.created_at,
                tags: t.tags,
                portal_id: t.portal_id,
            })),
            selected: templates.selected.map(
                t => new UserSelectedTemplateSummaryDto(t),
            ),
        };

        return result;
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
        console.log('template');
        console.log(template);
        return template as WordTemplateDto;
    }

    @ApiOperation({
        summary: 'Download word template file',
        description: 'Download the DOCX template file by template ID',
    })
    @ApiResponse({
        status: 200,
        description: 'File download',
        schema: {
            type: 'string',
            format: 'binary',
        },
    })
    @ApiProduces(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    @Get(':id/download')
    async downloadTemplate(
        @Param() params: WordTemplateIdParamsDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        await this.downloadTemplateService.downloadById(params.id, res);
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
    @Put(':id')
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
    async remove(@Param() params: WordTemplateIdParamsDto): Promise<boolean> {
        return await this.wordTemplateService.delete(BigInt(params.id));
    }

    @Get(':id/archive')
    async archive(@Param() params: WordTemplateIdParamsDto): Promise<boolean> {
        return await this.wordTemplateService.archive(BigInt(params.id));
    }

    @Get(':id/unarchive')
    async unarchive(
        @Param() params: WordTemplateIdParamsDto,
    ): Promise<boolean> {
        return await this.wordTemplateService.unarchive(BigInt(params.id));
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
