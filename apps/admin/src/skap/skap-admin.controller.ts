import {
    Body,
    Controller,
    Get,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import {
    SkapFileRepository,
    SkapItemRepository,
    SkapRunRepository,
} from '@lib/skap-lib';
import {
    SkapFileDto,
    SkapFilesQueryDto,
    SkapItemDto,
    SkapItemsQueryDto,
    SkapReprocessResponseDto,
    SkapRetryResponseDto,
    SkapRunDto,
    SkapRunRequestDto,
    SkapRunResponseDto,
} from './dto/skap-admin.dto';

/**
 * Мониторинг импорта СКАП (контур 3 оповещений): журналы прогонов,
 * файлов и записей + ручной перезапуск. Только админка (app-api-surface):
 * модуль подключается в apps/admin и не виден из event-service.
 */
@ApiTags('Admin SKAP')
@Controller('admin/skap')
export class SkapAdminController {
    constructor(
        private readonly runRepo: SkapRunRepository,
        private readonly fileRepo: SkapFileRepository,
        private readonly itemRepo: SkapItemRepository,
        private readonly settingsService: PortalAppSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
    ) {}

    @Post('run')
    @ApiOperation({
        summary: 'Пересчитать: запустить прогон импорта СКАП немедленно',
        description:
            'Ставит run-джоб импорта СКАП по домену, не дожидаясь крона — ' +
            'кнопка «пересчитать» после добавления файлов в папку на Диске. ' +
            'Прогон обработает только новые/перезалитые файлы (upsert-ы ' +
            'идемпотентны); если прогон по домену уже идёт, второй не ' +
            'ставится (jobId={domain}:run).',
    })
    @ApiBody({ type: SkapRunRequestDto })
    @ApiOkResponse({
        type: SkapRunResponseDto,
        description: 'Джоб поставлен в очередь skap-import.',
    })
    async runNow(@Body() dto: SkapRunRequestDto): Promise<SkapRunResponseDto> {
        const settings = await this.settingsService.resolve(
            dto.domain,
            EnumPortalAppCode.skap,
        );
        const jobId = `${dto.domain}:run`;
        await this.queueDispatcher.dispatch(
            QueueNames.SKAP_IMPORT,
            JobNames.SKAP_IMPORT_RUN,
            { domain: dto.domain },
            jobId,
            {
                attempts: 1,
                timeout: (settings.maxRunMinutes + 10) * 60_000,
                removeOnComplete: true,
                removeOnFail: true,
            },
        );
        return { queued: true, jobId };
    }

    @Get(':portalId/runs')
    @ApiOperation({
        summary: 'Журнал прогонов импорта СКАП портала',
        description:
            'Возвращает журнал прогонов импорта СКАП по порталу: статус, ' +
            'причину остановки, счётчики и время выполнения каждого прогона.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала (PortalDB)' })
    @ApiOkResponse({
        type: SkapRunDto,
        isArray: true,
        description: 'Список прогонов импорта СКАП портала.',
    })
    async listRuns(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<SkapRunDto[]> {
        const rows = await this.runRepo.listByPortal(BigInt(portalId));
        return rows.map(row => SkapRunDto.fromRow(row));
    }

    @Get(':portalId/files')
    @ApiOperation({
        summary: 'Журнал файлов выгрузок с Диска (фильтр по статусу)',
        description:
            'Возвращает журнал файлов выгрузок СКАП с Диска Битрикс ' +
            '(до 100 записей) с опциональным фильтром по статусу обработки.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала (PortalDB)' })
    @ApiOkResponse({
        type: SkapFileDto,
        isArray: true,
        description: 'Список файлов выгрузок со статусами обработки.',
    })
    async listFiles(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query() query: SkapFilesQueryDto,
    ): Promise<SkapFileDto[]> {
        const rows = await this.fileRepo.listByPortal(
            BigInt(portalId),
            100,
            query.status,
        );
        return rows.map(row => SkapFileDto.fromRow(row));
    }

    @Get(':portalId/items')
    @ApiOperation({
        summary:
            'Записи логин×месяц (фильтр по статусу; skipped_no_company — ' +
            'рег-листы без компании)',
        description:
            'Возвращает записи логин×месяц (до 200) с опциональным фильтром ' +
            'по статусу; статус skipped_no_company помогает найти рег-листы, ' +
            'для которых не заведена компания.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала (PortalDB)' })
    @ApiOkResponse({
        type: SkapItemDto,
        isArray: true,
        description: 'Список записей логин×месяц со статусами обработки.',
    })
    async listItems(
        @Param('portalId', ParseIntPipe) portalId: number,
        @Query() query: SkapItemsQueryDto,
    ): Promise<SkapItemDto[]> {
        const rows = await this.itemRepo.listByPortal(
            BigInt(portalId),
            200,
            query.status,
        );
        return rows.map(row => SkapItemDto.fromRow(row));
    }

    @Post('files/:fileId/retry')
    @ApiOperation({
        summary:
            'Перезапуск файла: сброс в pending (обработается следующим ' +
            'прогоном; upsert-ы идемпотентны)',
        description:
            'Сбрасывает файл журнала в статус pending — он будет обработан ' +
            'заново следующим прогоном; повторная обработка безопасна, ' +
            'так как upsert-ы идемпотентны.',
    })
    @ApiParam({ name: 'fileId', description: 'ID файла в журнале (uuid)' })
    @ApiOkResponse({
        type: SkapRetryResponseDto,
        description: 'Результат сброса: reset=false, если файл не найден.',
    })
    async retryFile(
        @Param('fileId') fileId: string,
    ): Promise<SkapRetryResponseDto> {
        const row = await this.fileRepo.resetToPending(fileId);
        return { reset: row !== null };
    }

    @Post(':portalId/reprocess-skipped')
    @ApiOperation({
        summary:
            'Повторная обработка записей без компании: файлы-источники ' +
            'skipped_no_company сбрасываются в pending (вызывать после ' +
            'заведения компаний с рег-листами)',
        description:
            'Сбрасывает в pending файлы-источники записей со статусом ' +
            'skipped_no_company, чтобы следующий прогон пересоздал записи; ' +
            'вызывать после заведения компаний с рег-листами.',
    })
    @ApiParam({ name: 'portalId', description: 'ID портала (PortalDB)' })
    @ApiOkResponse({
        type: SkapReprocessResponseDto,
        description: 'Количество файлов-источников, сброшенных в pending.',
    })
    async reprocessSkipped(
        @Param('portalId', ParseIntPipe) portalId: number,
    ): Promise<SkapReprocessResponseDto> {
        const fileIds = await this.itemRepo.findFileIdsByStatus(
            BigInt(portalId),
            'skipped_no_company',
        );
        let filesReset = 0;
        for (const fileId of fileIds) {
            const row = await this.fileRepo.resetToPending(fileId);
            if (row) filesReset += 1;
        }
        return { filesReset };
    }
}
