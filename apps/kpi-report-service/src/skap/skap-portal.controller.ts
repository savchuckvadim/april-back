import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import {
    EnumPortalAppCode,
    PortalAppSettingsService,
} from '@lib/portal-lib/store/app-settings';
import { JobNames, QueueDispatcherService, QueueNames } from '@lib/queue';
import { SkapFileRepository, SkapRunRepository } from '@lib/skap-lib';
import {
    SkapPortalLastRunDto,
    SkapPortalRunRequestDto,
    SkapPortalRunResponseDto,
    SkapPortalStatusResponseDto,
} from './dto/skap-portal.dto';

/**
 * Портальная поверхность импорта СКАП для фронта kpi-service
 * (front/apps/kpi-service): кнопка «пересчитать» + индикатор обновления.
 * Сам конвейер-воркер живёт в apps/event-service; здесь — только
 * постановка джоба и чтение статуса из журнала.
 */
@ApiTags('SKAP')
@Controller('skap')
export class SkapPortalController {
    constructor(
        private readonly settingsService: PortalAppSettingsService,
        private readonly queueDispatcher: QueueDispatcherService,
        private readonly runRepo: SkapRunRepository,
        private readonly fileRepo: SkapFileRepository,
    ) {}

    @Post('run')
    @ApiOperation({
        summary: 'Пересчитать: запустить прогон импорта СКАП немедленно',
        description:
            'Ставит run-джоб импорта СКАП по домену, не дожидаясь крона — ' +
            'кнопка «пересчитать» после добавления файлов в папку «СКАП. ' +
            'Загрузка» на Диске. Если прогон уже идёт — второй не ставится ' +
            '(jobId={domain}:run). Импорт должен быть включён в настройках ' +
            'приложения skap.',
    })
    @ApiBody({ type: SkapPortalRunRequestDto })
    @ApiOkResponse({
        type: SkapPortalRunResponseDto,
        description: 'Джоб поставлен в очередь skap-import.',
    })
    async runNow(
        @Body() dto: SkapPortalRunRequestDto,
    ): Promise<SkapPortalRunResponseDto> {
        const settings = await this.settingsService.resolve(
            dto.domain,
            EnumPortalAppCode.skap,
        );
        if (!settings.enabled) {
            throw new BadRequestException(
                `Импорт СКАП выключен для портала ${dto.domain} — включите ` +
                    'его в настройках приложения (app=skap) в админке',
            );
        }
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

    @Get('status')
    @ApiOperation({
        summary: 'Статус импорта СКАП (индикатор обновления на фронте)',
        description:
            'running=true — прогон идёт прямо сейчас; pendingFiles — сколько ' +
            'файлов ждёт обработки; lastRun — итог последнего прогона со ' +
            'счётчиками. Фронт поллит эндпоинт, пока running или ' +
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
    async status(
        @Query('domain') domain: string,
    ): Promise<SkapPortalStatusResponseDto> {
        if (!domain?.trim()) {
            throw new BadRequestException(
                'Query-параметр domain обязателен (домен портала Битрикс)',
            );
        }
        const trimmed = domain.trim();
        const lastRun = await this.runRepo.findLatestByDomain(trimmed);
        const pendingFiles = await this.fileRepo.countPendingByDomain(trimmed);
        const settings = await this.settingsService.resolve(
            trimmed,
            EnumPortalAppCode.skap,
        );
        return {
            running: lastRun?.status === 'running',
            pendingFiles,
            lastRun: lastRun ? SkapPortalLastRunDto.fromRow(lastRun) : null,
            folderUrl: settings.folderUrl || null,
        };
    }
}
