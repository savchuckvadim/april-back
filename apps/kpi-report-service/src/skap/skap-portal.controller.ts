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
 * Портальная поверхность импорта СКАП для фронта kpi-service
 * (front/apps/kpi-service): кнопка «пересчитать» + индикатор обновления.
 * Логика и DTO — в общем SkapPortalService (@lib/skap-lib/portal),
 * то же зеркало торчит из apps/event-service для его фронта.
 */
@ApiTags('SKAP')
@Controller('skap')
export class SkapPortalController {
    constructor(private readonly portalService: SkapPortalService) {}

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
        return this.portalService.runNow(dto.domain);
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
        return this.portalService.status(domain);
    }
}
