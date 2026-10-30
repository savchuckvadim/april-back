import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Logger,
    Param,
    Post,
    Query,
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
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
    CATALOG_TABLE_KINDS,
    CatalogTable,
    CatalogTableKind,
    CatalogTableRegistry,
} from '../services/catalog-table.registry';
import { PriceBookMode } from '../services/price-book-export.service';
import {
    ImportTableRequestDto,
    TableImportReportDto,
} from '../dto/catalog-table.dto';

const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Эталонные таблицы каталога «Гарант»: скачать текущее состояние (или
 * пустой шаблон), поправить, загрузить обратно. Контроллер живёт только
 * в админке (ai/rules/app-api-surface.md).
 */
@ApiTags('Admin Garant Catalog Tables')
@Controller('admin/garant/tables')
export class CatalogTableAdminController {
    private readonly logger = new Logger(CatalogTableAdminController.name);

    constructor(private readonly registry: CatalogTableRegistry) {}

    @Get(':kind/export')
    @ApiOperation({
        summary: 'Скачать таблицу каталога',
        description:
            'Отдаёт xlsx в том же формате, который читает загрузка. ' +
            'prices — книга цен (рабсы регионов, веса и АБС универсальной линейки, ' +
            'прайс PROF по числу ОД, пакеты услуг, АБС консалтинга); ' +
            'supplies — виды поставок с текстами договоров; ' +
            'complects — карточки комплектов и пакетов. ' +
            'mode=blank отдаёт тот же файл с пустыми значениями (только строки-ключи).',
    })
    @ApiParam({
        name: 'kind',
        description: 'Какая таблица каталога нужна.',
        enum: CATALOG_TABLE_KINDS,
        example: 'prices',
    })
    @ApiQuery({
        name: 'mode',
        required: false,
        enum: ['current', 'blank'],
        description:
            'current (по умолчанию) — с текущими данными; blank — пустой шаблон для внесения прайса с нуля.',
        example: 'current',
    })
    @ApiOkResponse({
        description: 'Файл xlsx.',
        content: {
            [XLSX_MIME]: { schema: { type: 'string', format: 'binary' } },
        },
    })
    async export(
        @Param('kind') kind: string,
        @Query('mode') mode: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const table = this.resolve(kind);
        const exportMode: PriceBookMode =
            mode === 'blank' ? 'blank' : 'current';
        if (exportMode === 'blank' && !table.supportsBlank) {
            throw new BadRequestException(
                `Для таблицы «${kind}» пустой шаблон не предусмотрен — скачайте текущие данные`,
            );
        }
        const buffer = await table.export(exportMode);
        const suffix = exportMode === 'blank' ? '-blank' : '';
        res.setHeader('Content-Type', XLSX_MIME);
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="garant-${kind}${suffix}.xlsx"`,
        );
        res.send(buffer);
    }

    @Post(':kind/import')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({
        summary: 'Загрузить заполненную таблицу каталога',
        description:
            'Читает листы по именам и колонки по заголовкам, применяет изменения по кодам. ' +
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
        // Лог на входе — до любой логики: по нему видно, что запрос вообще
        // доехал до приложения, какой файл пришёл и в каком режиме.
        const dryRun = dto.dryRun ?? false;
        this.logger.log(
            `Загрузка таблицы «${kind}»: файл ${file?.originalname ?? 'НЕ ПЕРЕДАН'}, ` +
                `${file?.buffer.length ?? 0} байт, dryRun=${String(dto.dryRun)} → ` +
                `${dryRun ? 'пробный прогон' : 'ЗАПИСЬ В КАТАЛОГ'}`,
        );
        const table = this.resolve(kind);
        if (!file) {
            this.logger.error(`Загрузка «${kind}» отклонена: файл не передан`);
            throw new BadRequestException('Файл не передан (поле file)');
        }
        try {
            const reports = await table.import(file.buffer, dryRun);
            for (const report of reports) {
                this.logger.log(
                    `Загрузка «${kind}», лист ${report.section}: создано ${report.created}, ` +
                        `обновлено ${report.updated}, без изменений ${report.unchanged}, ` +
                        `пропущено ${report.skipped.length}`,
                );
                for (const row of report.skipped) {
                    this.logger.warn(
                        `Загрузка «${kind}», лист ${report.section}: строка ${row.key} не применена — ${row.reason}`,
                    );
                }
            }
            return reports;
        } catch (error) {
            // Причину пишем в лог целиком: наружу уходит только текст
            // сообщения, а разбираться потом по нему одному невозможно.
            this.logger.error(
                `Загрузка «${kind}» не удалась: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                error instanceof Error ? error.stack : undefined,
            );
            throw new BadRequestException(
                error instanceof Error
                    ? error.message
                    : 'Не удалось прочитать таблицу',
            );
        }
    }

    private resolve(kind: string): CatalogTable {
        const table = this.registry.get(kind as CatalogTableKind);
        if (!table) {
            throw new BadRequestException(
                `Неизвестная таблица «${kind}». Доступны: ${CATALOG_TABLE_KINDS.join(', ')}`,
            );
        }
        return table;
    }
}
