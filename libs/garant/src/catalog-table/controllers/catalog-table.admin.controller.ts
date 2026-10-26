import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Param,
    Post,
    Res,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
    CATALOG_TABLE_KINDS,
    CatalogTableKind,
    CatalogTableRegistry,
} from '../services/catalog-table.registry';
import {
    ImportTableRequestDto,
    TableImportReportDto,
} from '../dto/catalog-table.dto';

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Эталонные таблицы каталога «Гарант»: скачать текущее состояние,
 * поправить в редакторе, загрузить обратно. Контроллер живёт только в
 * админке (ai/rules/app-api-surface.md).
 */
@ApiTags('Admin Garant Catalog Tables')
@Controller('admin/garant/tables')
export class CatalogTableAdminController {
    constructor(private readonly registry: CatalogTableRegistry) {}

    @Get(':kind/export')
    @ApiOperation({
        summary: 'Скачать эталонную таблицу каталога',
        description:
            'Отдаёт xlsx с текущим состоянием БД в том же формате, который читает загрузка: ' +
            'prices — цены (листы prof-regions, prof-msk, services), regions — рабсы регионов, ' +
            'supplies — виды поставок с текстами договоров, complects — карточки комплектов и пакетов.',
    })
    @ApiParam({
        name: 'kind',
        description: 'Какая таблица каталога нужна.',
        enum: CATALOG_TABLE_KINDS,
        example: 'prices',
    })
    @ApiOkResponse({
        description: 'Файл xlsx с текущими данными каталога.',
        content: {
            [XLSX_MIME]: { schema: { type: 'string', format: 'binary' } },
        },
    })
    async export(
        @Param('kind') kind: string,
        @Res() res: Response,
    ): Promise<void> {
        const table = this.resolve(kind);
        const buffer = await table.export();
        res.setHeader('Content-Type', XLSX_MIME);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="garant-${kind}.xlsx"`,
        );
        res.send(buffer);
    }

    @Post(':kind/import')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить заполненную таблицу каталога',
        description:
            'Читает лист(ы) по заголовкам колонок и применяет изменения upsert-ом по кодам. ' +
            'Пустая ячейка означает «не менять», строки, которых нет в файле, не удаляются. ' +
            'dryRun=true показывает отчёт без записи.',
    })
    @ApiParam({
        name: 'kind',
        description: 'Какая таблица каталога загружается.',
        enum: CATALOG_TABLE_KINDS,
        example: 'prices',
    })
    @ApiBody({
        description: 'Файл xlsx и флаг пробного прогона.',
        schema: {
            type: 'object',
            required: ['file'],
            properties: {
                file: { type: 'string', format: 'binary' },
                dryRun: { type: 'boolean', default: false },
            },
        },
    })
    @ApiOkResponse({
        description:
            'Отчёты по листам: создано, обновлено, без изменений, пропущено с причинами.',
        type: [TableImportReportDto],
    })
    async import(
        @Param('kind') kind: string,
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() dto: ImportTableRequestDto,
    ): Promise<TableImportReportDto[]> {
        const table = this.resolve(kind);
        if (!file) {
            throw new BadRequestException('Файл не передан (поле file)');
        }
        try {
            return await table.import(file.buffer, dto.dryRun ?? false);
        } catch (error) {
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Не удалось прочитать таблицу',
            );
        }
    }

    private resolve(kind: string): {
        export: () => Promise<Buffer>;
        import: (
            buffer: Buffer,
            dryRun: boolean,
        ) => Promise<TableImportReportDto[]>;
    } {
        const table = this.registry.get(kind as CatalogTableKind);
        if (!table) {
            throw new BadRequestException(
                `Неизвестная таблица «${kind}». Доступны: ${CATALOG_TABLE_KINDS.join(', ')}`,
            );
        }
        return table;
    }
}
