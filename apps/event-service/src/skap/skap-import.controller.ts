import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    SkapPortalRunRequestDto,
    SkapPortalRunResponseDto,
    SkapPortalService,
    SkapPortalStatusResponseDto,
} from '@lib/skap-lib';

/**
 * Портальная поверхность импорта СКАП для фронта event-service:
 * кнопка «Обновить из хранилища» (run) + индикатор и маленькая ссылка
 * «Хранилище СКАП» (status.folderUrl). Логика и DTO — в общем
 * SkapPortalService (@lib/skap-lib/portal); то же зеркало для фронта
 * kpi-service торчит из apps/kpi-report-service.
 */
@ApiTags('Event Service SKAP')
@Controller('event-service/skap')
export class SkapImportController {
    constructor(private readonly portalService: SkapPortalService) {}

    @Post('run')
    @ApiOperation({
        summary:
            'Обновить из хранилища: запустить прогон импорта СКАП немедленно',
        description:
            'Ставит run-джоб импорта СКАП по домену, не дожидаясь крона: ' +
            'воркер сканирует папку «СКАП. Загрузка» на Диске группы и ' +
            'обрабатывает новые/перезалитые файлы. Если прогон уже идёт — ' +
            'второй не ставится (jobId={domain}:run), это не ошибка. ' +
            'Импорт должен быть включён в настройках приложения skap.',
    })
    @ApiBody({ type: SkapPortalRunRequestDto })
    @ApiOkResponse({
        type: SkapPortalRunResponseDto,
        description: 'Джоб поставлен в очередь skap-import.',
    })
    async skapImportRun(
        @Body() dto: SkapPortalRunRequestDto,
    ): Promise<SkapPortalRunResponseDto> {
        return this.portalService.runNow(dto.domain);
    }

    @Get('status')
    @ApiOperation({
        summary: 'Статус импорта СКАП (индикатор + ссылка на хранилище)',
        description:
            'running=true — прогон идёт прямо сейчас; pendingFiles — сколько ' +
            'файлов ждёт обработки; lastRun — итог последнего прогона со ' +
            'счётчиками; folderUrl — ссылка «Хранилище СКАП» на папку Диска ' +
            '(null до первого прогона); smartUrl — ссылка на список ' +
            'элементов смарта «СКАП» в CRM портала (null, пока смарт не ' +
            'установлен). Фронт поллит эндпоинт, пока running или ' +
            'pendingFiles > 0.',
    })
    @ApiQuery({
        name: 'domain',
        description: 'Домен портала Битрикс',
        example: 'client.bitrix24.ru',
    })
    @ApiOkResponse({
        type: SkapPortalStatusResponseDto,
        description: 'Текущий статус импорта СКАП по домену.',
    })
    async skapImportStatus(
        @Query('domain') domain: string,
    ): Promise<SkapPortalStatusResponseDto> {
        return this.portalService.status(domain);
    }
}
