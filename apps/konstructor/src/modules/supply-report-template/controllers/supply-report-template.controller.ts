import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Res,
    UploadedFiles,
    UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiProduces,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { SupplyReportTemplateCrudService } from '../services/supply-report-template-crud.service';
import { SupplyReportTemplateDownloadService } from '../services/supply-report-template-download.service';
import { SupplyReportTemplateQueryService } from '../services/supply-report-template-query.service';
import {
    CreateSupplyReportTemplateBodyDto,
    CreateSupplyReportTemplateMultipartDto,
    SetSupplyReportTemplateAgentDto,
    SetSupplyReportTemplatePortalDto,
    SupplyReportTemplateActiveDto,
    SupplyReportTemplateDefaultDto,
    SupplyReportTemplateDownloadQueryDto,
    SupplyReportTemplateIdParamsDto,
    SupplyReportTemplatePageDto,
    SupplyReportTemplatePortalParamsDto,
    SupplyReportTemplateQueryDto,
    SupplyReportTemplateResponseDto,
    UpdateSupplyReportTemplateDto,
    UpdateSupplyReportTemplateMultipartDto,
} from '../dto';

/** Файлы ручек создания/обновления: основной шаблон + демонстрационный. */
const FILE_FIELDS = [
    { name: 'file', maxCount: 1 },
    { name: 'demo', maxCount: 1 },
];

/** То, что отдаёт `FileFieldsInterceptor`: массивы по имени поля. */
type UploadedTemplateFiles = {
    file?: Express.Multer.File[];
    demo?: Express.Multer.File[];
};

/**
 * Шаблоны отчёта о поставке.
 *
 * Строка шаблона в этом домене ОПЦИОНАЛЬНА: генерация отчёта сегодня берёт
 * .docx из файловой системы, таблица может быть пуста. Поэтому список на
 * пустой таблице — это пустая страница, а не ошибка, и ни одна ручка не
 * предполагает, что шаблон уже заведён.
 *
 * Все смены состояния — через `@Patch`, а не `@Put`: это частичные
 * изменения одного флага, и `PUT` обещал бы замену всей сущности.
 */
@ApiTags('Supply report templates')
@Controller('supply-report-templates')
export class SupplyReportTemplateController {
    constructor(
        private readonly queryService: SupplyReportTemplateQueryService,
        private readonly crudService: SupplyReportTemplateCrudService,
        private readonly downloadService: SupplyReportTemplateDownloadService,
    ) {}

    @ApiOperation({
        summary:
            'Список шаблонов отчёта о поставке (фильтры query, с пагинацией)',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplatePageDto })
    @Get()
    async findAll(
        @Query() query: SupplyReportTemplateQueryDto,
    ): Promise<SupplyReportTemplatePageDto> {
        return this.queryService.findMany(query);
    }

    @ApiOperation({
        summary: 'Общие шаблоны (portal_id IS NULL) — доступны всем порталам',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplatePageDto })
    @Get('common')
    async findCommon(
        @Query() query: SupplyReportTemplateQueryDto,
    ): Promise<SupplyReportTemplatePageDto> {
        return this.queryService.findCommon(query);
    }

    @ApiOperation({
        summary:
            'Шаблоны портала ВМЕСТЕ с общими: портал пользуется и своими, ' +
            'и унаследованными общими',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplatePageDto })
    @Get('portal/:portal_id')
    async findByPortal(
        @Param() params: SupplyReportTemplatePortalParamsDto,
        @Query() query: SupplyReportTemplateQueryDto,
    ): Promise<SupplyReportTemplatePageDto> {
        return this.queryService.findByPortal(BigInt(params.portal_id), query);
    }

    /**
     * Объявлено ДО `GET :id`: иначе `:id` перехватил бы `.../download`,
     * и скачивание отвечало бы 400 на `@IsNumberString`.
     */
    @ApiOperation({ summary: 'Скачать файл шаблона (или демонстрационный)' })
    @ApiProduces(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    @Get(':id/download')
    async download(
        @Param() params: SupplyReportTemplateIdParamsDto,
        @Query() query: SupplyReportTemplateDownloadQueryDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<void> {
        await this.downloadService.downloadById(
            BigInt(params.id),
            res,
            query.demo ?? false,
        );
    }

    @ApiOperation({ summary: 'Шаблон по id' })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Get(':id')
    async findOne(
        @Param() params: SupplyReportTemplateIdParamsDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.queryService.findById(BigInt(params.id));
    }

    @ApiOperation({
        summary: 'Создать шаблон и загрузить файл (.docx), опционально демо',
    })
    @ApiResponse({ status: 201, type: SupplyReportTemplateResponseDto })
    @Post()
    @UseInterceptors(FileFieldsInterceptor(FILE_FIELDS))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: CreateSupplyReportTemplateMultipartDto })
    async create(
        @UploadedFiles() files: UploadedTemplateFiles,
        @Body() body: CreateSupplyReportTemplateBodyDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.create(body, {
            file: files?.file?.[0],
            demo: files?.demo?.[0],
        });
    }

    @ApiOperation({
        summary: 'Обновить шаблон (частично, опционально заменить файлы)',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id')
    @UseInterceptors(FileFieldsInterceptor(FILE_FIELDS))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UpdateSupplyReportTemplateMultipartDto })
    async update(
        @Param() params: SupplyReportTemplateIdParamsDto,
        @Body() dto: UpdateSupplyReportTemplateDto,
        @UploadedFiles() files?: UploadedTemplateFiles,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.update(BigInt(params.id), dto, {
            file: files?.file?.[0],
            demo: files?.demo?.[0],
        });
    }

    @ApiOperation({
        summary:
            'Привязать / отвязать портал. Пустое значение переводит шаблон ' +
            'в общие и снимает поставщика',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id/portal')
    async setPortal(
        @Param() params: SupplyReportTemplateIdParamsDto,
        @Body() body: SetSupplyReportTemplatePortalDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.setPortal(BigInt(params.id), body.portal_id);
    }

    @ApiOperation({
        summary:
            'Привязать / отвязать поставщика. Проверяется, что поставщик ' +
            'принадлежит порталу шаблона',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id/agent')
    async setAgent(
        @Param() params: SupplyReportTemplateIdParamsDto,
        @Body() body: SetSupplyReportTemplateAgentDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.setAgent(BigInt(params.id), body.agent_id);
    }

    @ApiOperation({
        summary: 'Активен / неактивен (неактивные не участвуют в подборе)',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id/active')
    async setActive(
        @Param() params: SupplyReportTemplateIdParamsDto,
        @Body() body: SupplyReportTemplateActiveDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.setActive(
            BigInt(params.id),
            body.is_active ?? true,
        );
    }

    @ApiOperation({
        summary:
            'Шаблон по умолчанию в своей области (портал + поставщик). ' +
            'Типа договора у отчёта о поставке нет, в область он не входит',
    })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id/default')
    async setDefault(
        @Param() params: SupplyReportTemplateIdParamsDto,
        @Body() body: SupplyReportTemplateDefaultDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.setDefault(
            BigInt(params.id),
            body.is_default ?? true,
        );
    }

    @ApiOperation({ summary: 'В архив (флаг «по умолчанию» снимается)' })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id/archive')
    async archive(
        @Param() params: SupplyReportTemplateIdParamsDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.setArchived(BigInt(params.id), true);
    }

    @ApiOperation({ summary: 'Вернуть из архива' })
    @ApiResponse({ status: 200, type: SupplyReportTemplateResponseDto })
    @Patch(':id/unarchive')
    async unarchive(
        @Param() params: SupplyReportTemplateIdParamsDto,
    ): Promise<SupplyReportTemplateResponseDto> {
        return this.crudService.setArchived(BigInt(params.id), false);
    }

    @ApiOperation({ summary: 'Удалить шаблон вместе с файлами' })
    @ApiResponse({ status: 200, description: 'Шаблон удалён' })
    @Delete(':id')
    async remove(
        @Param() params: SupplyReportTemplateIdParamsDto,
    ): Promise<void> {
        await this.crudService.delete(BigInt(params.id));
    }
}
