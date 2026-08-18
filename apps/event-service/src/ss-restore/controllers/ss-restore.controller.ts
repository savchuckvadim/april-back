import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    SsRestoreApplyDto,
    SsRestoreApplyResponseDto,
    SsRestoreDiscardResponseDto,
    SsRestoreOperationDto,
    SsRestoreScanDto,
    SsRestoreScanResponseDto,
} from '../dto/ss-restore.dto';
import { SsRestoreUseCase } from '../use-cases/ss-restore.use-case';

@ApiTags('Event Service SS Restore')
@Controller('event-service/ss-restore')
export class SsRestoreController {
    constructor(private readonly useCase: SsRestoreUseCase) {}

    @Post('scan')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Восстановление СС, фаза 1: найти потерянные (dry-run)',
        description:
            'Ищет закрытые задачи групп СС за период, у которых нет парной ' +
            'записи «Сервисный сигнал Состоялся» в ОРК-истории (окно ±2 дня ' +
            'от даты закрытия). Ничего не пишет: возвращает кандидатов с ' +
            'превью (дата, связи CRM, ответственный, коммент менеджера из ' +
            'задачи, найденная «Создан»-строка) и operationId (живёт 1 час). ' +
            'Просмотрите список и вызовите apply (по taskIds/limit — ' +
            'небольшими пачками) или discard.',
    })
    @ApiBody({ type: SsRestoreScanDto })
    @ApiOkResponse({ type: SsRestoreScanResponseDto })
    async scan(
        @Body() dto: SsRestoreScanDto,
    ): Promise<SsRestoreScanResponseDto> {
        return this.useCase.scan(dto);
    }

    @Post('apply')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Восстановление СС, фаза 2: ЗАПИСАТЬ выбранных кандидатов',
        description:
            'Создаёт элементы «Сервисный сигнал Состоялся» на дату закрытия ' +
            'задачи, с тэгом restored-ss-2026-08 и детерминированным ' +
            'ELEMENT_CODE (повторный запуск не создаст дублей — вернётся в ' +
            'skippedAlreadyExists). Применённые вычёркиваются из сессии; ' +
            'failed остаются для повтора до истечения TTL.',
    })
    @ApiBody({ type: SsRestoreApplyDto })
    @ApiOkResponse({ type: SsRestoreApplyResponseDto })
    async apply(
        @Body() dto: SsRestoreApplyDto,
    ): Promise<SsRestoreApplyResponseDto> {
        return this.useCase.apply(dto);
    }

    @Post('discard')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Восстановление СС: сброс сессии (ничего не писать)',
    })
    @ApiBody({ type: SsRestoreOperationDto })
    @ApiOkResponse({ type: SsRestoreDiscardResponseDto })
    async discard(
        @Body() dto: SsRestoreOperationDto,
    ): Promise<SsRestoreDiscardResponseDto> {
        return this.useCase.discard(dto.operationId);
    }
}
