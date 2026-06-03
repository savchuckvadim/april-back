import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiParam,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { InvoiceTemplateService } from '../services/invoice-template.service';
import { InvoiceTemplateDownloadService } from '../services/invoice-template-download.service';
import {
    CreateInvoiceTemplateBodyDto,
    CreateInvoiceTemplateMultipartDto,
    InvoiceTemplateActiveDto,
    InvoiceTemplateDefaultDto,
    InvoiceTemplateIdParamsDto,
    InvoiceTemplatePortalParamsDto,
    InvoiceTemplateQueryDto,
    InvoiceTemplateResponseDto,
    SetInvoiceTemplateAgentDto,
    SetInvoiceTemplatePortalDto,
    UpdateInvoiceTemplateDto,
} from '../dto';

@ApiTags('Invoice templates')
@Controller('invoice-templates')
export class InvoiceTemplateController {
    constructor(
        private readonly invoiceTemplateService: InvoiceTemplateService,
        private readonly downloadService: InvoiceTemplateDownloadService,
    ) {}

    @ApiOperation({ summary: 'Список шаблонов счетов (фильтры query)' })
    @ApiResponse({ status: 200, type: [InvoiceTemplateResponseDto] })
    @Get()
    async findAll(
        @Query() query: InvoiceTemplateQueryDto,
    ): Promise<InvoiceTemplateResponseDto[]> {
        return this.invoiceTemplateService.findMany(query);
    }

    @ApiOperation({ summary: 'Публичные шаблоны (visibility=public)' })
    @ApiResponse({ status: 200, type: [InvoiceTemplateResponseDto] })
    @Get('public')
    async findPublic(): Promise<InvoiceTemplateResponseDto[]> {
        return this.invoiceTemplateService.findPublic();
    }

    @ApiOperation({ summary: 'Шаблоны, привязанные к порталу (по portal_id)' })
    @ApiParam({ name: 'portal_id', type: String })
    @ApiResponse({ status: 200, type: [InvoiceTemplateResponseDto] })
    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: InvoiceTemplatePortalParamsDto,
    ): Promise<InvoiceTemplateResponseDto[]> {
        return this.invoiceTemplateService.findByPortal(
            BigInt(params.portal_id),
        );
    }

    @ApiOperation({ summary: 'Создать шаблон + загрузить файл (.docx)' })
    @ApiResponse({ status: 201, type: InvoiceTemplateResponseDto })
    @Post()
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: CreateInvoiceTemplateMultipartDto })
    async create(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: CreateInvoiceTemplateBodyDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.create(body, file);
    }

    @ApiOperation({ summary: 'Скачать файл шаблона' })
    @ApiProduces(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    @Get(':id/download')
    async download(
        @Param() params: InvoiceTemplateIdParamsDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        await this.downloadService.downloadById(params.id, res);
    }

    @ApiOperation({ summary: 'Шаблон по id' })
    @ApiResponse({ status: 200, type: InvoiceTemplateResponseDto })
    @Get(':id')
    async findOne(
        @Param() params: InvoiceTemplateIdParamsDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.findById(params.id);
    }

    @ApiOperation({ summary: 'Обновить шаблон (опционально новый файл)' })
    @ApiResponse({ status: 200, type: InvoiceTemplateResponseDto })
    @Put(':id')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UpdateInvoiceTemplateDto })
    async update(
        @Param() params: InvoiceTemplateIdParamsDto,
        @Body() dto: UpdateInvoiceTemplateDto,
        @UploadedFile() file?: Express.Multer.File,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.update(params.id, dto, file);
    }

    @ApiOperation({ summary: 'Удалить шаблон и файл' })
    @Delete(':id')
    async remove(@Param() params: InvoiceTemplateIdParamsDto): Promise<void> {
        await this.invoiceTemplateService.delete(params.id);
    }

    @ApiOperation({ summary: 'Привязать / отвязать портал (1:1)' })
    @ApiResponse({ status: 200, type: InvoiceTemplateResponseDto })
    @Patch(':id/portal')
    async setPortal(
        @Param() params: InvoiceTemplateIdParamsDto,
        @Body() body: SetInvoiceTemplatePortalDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.setPortal(params.id, body.portal_id);
    }

    @ApiOperation({ summary: 'Привязать / отвязать агента (id с фронта)' })
    @ApiResponse({ status: 200, type: InvoiceTemplateResponseDto })
    @Patch(':id/agent')
    async setAgent(
        @Param() params: InvoiceTemplateIdParamsDto,
        @Body() body: SetInvoiceTemplateAgentDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.setAgent(params.id, body.agent_id);
    }

    @ApiOperation({ summary: 'Активен / неактивен' })
    @Patch(':id/active')
    async setActive(
        @Param() params: InvoiceTemplateIdParamsDto,
        @Body() body: InvoiceTemplateActiveDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.setActive(params.id, body.is_active);
    }

    @ApiOperation({
        summary: 'Шаблон по умолчанию в своей группе (visibility+portal+agent)',
    })
    @Patch(':id/default')
    async setDefault(
        @Param() params: InvoiceTemplateIdParamsDto,
        @Body() body: InvoiceTemplateDefaultDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.setDefault(
            params.id,
            body.is_default,
        );
    }

    @ApiOperation({ summary: 'В архив' })
    @Patch(':id/archive')
    async archive(
        @Param() params: InvoiceTemplateIdParamsDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.archive(params.id);
    }

    @ApiOperation({ summary: 'Из архива' })
    @Patch(':id/unarchive')
    async unarchive(
        @Param() params: InvoiceTemplateIdParamsDto,
    ): Promise<InvoiceTemplateResponseDto> {
        return this.invoiceTemplateService.unarchive(params.id);
    }
}
