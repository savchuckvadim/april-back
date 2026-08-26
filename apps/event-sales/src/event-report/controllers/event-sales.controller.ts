import {
    Body,
    Controller,
    Get,
    HttpCode,
    Logger,
    NotFoundException,
    Param,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { QueueDispatcherService } from '@/modules/queue/dispatch/queue-dispatcher.service';
import { QueueNames } from '@/modules/queue/constants/queue-names.enum';
import { JobNames } from '@/modules/queue/constants/job-names.enum';
import { EventSalesFlowDto } from '../dto/event-sale-flow/event-sales-flow.dto';
import { EventFlowOperationDto } from '../dto/response/event-flow-operation.dto';
import { EventFlowJobData } from '../dto/event-flow-job.dto';
import { EventFlowStatusService } from '../services/status/event-flow-status.service';
import { StagePredictService } from '../services/stage-predict/stage-predict.service';
import {
    StagePredictRequestDto,
    StagePredictResponseDto,
} from '../dto/stage-predict/stage-predict.dto';
import { EventFlowGuardService } from '../services/flow-guard/event-flow-guard.service';

@ApiTags('Event Sales')
@Controller('event-sales')
export class EventSalesController {
    private readonly logger = new Logger(EventSalesController.name);

    constructor(
        private readonly queue: QueueDispatcherService,
        private readonly status: EventFlowStatusService,
        private readonly stagePredict: StagePredictService,
        private readonly flowGuard: EventFlowGuardService,
    ) {}

    /**
     * Предикт смены стадии основной воронки — ДО отправки отчёта.
     * Фронт зовёт его при смене статуса/типа плана, чтобы показать
     * стадийные чек-листы («Клиент на решении», «Продажа») заранее.
     */
    @ApiOperation({
        summary: 'Предикт стадии основной сделки',
        description:
            'Считает, куда отправка отчёта с таким контекстом двинет ' +
            'основную сделку (та же лестница, что у реального flow). ' +
            'UX-хинт для чек-листов: реальный прогон пересчитает стадию сам.',
    })
    @ApiBody({ type: StagePredictRequestDto })
    @ApiOkResponse({ type: StagePredictResponseDto })
    @Post('stage-predict')
    @HttpCode(200)
    async getStagePredict(
        @Body() dto: StagePredictRequestDto,
    ): Promise<StagePredictResponseDto> {
        return this.stagePredict.predict(dto);
    }

    /**
     * Приём отчёта менеджера из приложения «Звонки».
     *
     * Контроллер только принимает и ставит в очередь: сам flow (batch Битрикса
     * на десятки команд) выполняет {@link EventFlowProcessor}. Раньше всё это
     * крутилось внутри HTTP-запроса, и менеджер ждал ответа минутами.
     *
     * Отчёт — команда, а не запрос, поэтому у операции есть id: повторный POST
     * с тем же `operationId` не выполнит её второй раз, а вернёт текущий статус.
     * Это же спасает при обрыве связи — клиент повторяет запрос, а не рискует
     * записать отчёт дважды.
     */
    @ApiOperation({
        summary: 'Event sales flow: принять отчёт в обработку',
        description:
            'Ставит отправку отчёта в очередь и отвечает сразу. Исход приходит ' +
            'по WS-событию `event-sales-flow:done` / `event-sales-flow:error` на ' +
            'переданный `socketId`, а также доступен поллингом ' +
            '`GET /event-sales/flow/status/{operationId}`. Повторный вызов с тем ' +
            'же `operationId` возвращает статус уже принятой операции и НЕ ' +
            'выполняет flow второй раз.',
    })
    @ApiBody({ type: EventSalesFlowDto })
    @ApiOkResponse({
        description: 'Операция принята (или уже была принята ранее).',
        type: EventFlowOperationDto,
    })
    @Post('flow')
    @HttpCode(200)
    async getFlow(
        @Body() dto: EventSalesFlowDto,
    ): Promise<EventFlowOperationDto> {
        // Согласованность DTO проверяется ДО очереди: 400 отсюда фронт
        // покажет баннером, 400 из воркера не увидит никто.
        await this.flowGuard.assertValid(dto);

        const operationId = dto.operationId || randomUUID();

        const existing = await this.status.get(dto.domain, operationId);
        if (existing) {
            this.logger.log(
                `event-sales/flow: operation ${operationId} уже принята ` +
                    `(${existing.status}) — повторно не выполняем`,
            );
            return existing;
        }

        this.logger.log(
            `event-sales/flow: domain=${dto.domain}, operationId=${operationId}, ` +
                `plan=${dto.plan?.type?.current?.code}, report=${dto.report?.resultStatus}`,
        );

        const operation = await this.status.setQueued(
            dto.domain,
            operationId,
            new Date().toISOString(),
        );

        const jobData: EventFlowJobData = {
            operationId,
            domain: dto.domain,
            socketId: dto.socketId,
            dto,
        };
        // jobId = operationId: два одинаковых запроса не породят два прогона.
        await this.queue.dispatch(
            QueueNames.EVENT_SALES_FLOW,
            JobNames.EVENT_SALES_FLOW,
            jobData,
            operationId,
            { removeOnComplete: true, removeOnFail: true },
        );

        return operation;
    }

    /**
     * Статус операции. Фолбэк к WS: сокета может не быть (другая реплика,
     * оборванное соединение, перезагруженный фрейм), а исход знать надо.
     */
    @ApiOperation({
        summary: 'Статус операции отправки отчёта',
        description:
            'Возвращает состояние операции: `queued`, `running`, `done` или ' +
            '`failed`. Статус живёт час после завершения.',
    })
    @ApiParam({ name: 'operationId', description: 'Идентификатор операции.' })
    @ApiQuery({
        name: 'domain',
        description:
            'Домен портала — в его пространстве живёт статус операции.',
    })
    @ApiOkResponse({ type: EventFlowOperationDto })
    @Get('flow/status/:operationId')
    async getFlowStatus(
        @Param('operationId') operationId: string,
        @Query('domain') domain: string,
    ): Promise<EventFlowOperationDto> {
        const operation = await this.status.get(domain, operationId);
        if (!operation) {
            throw new NotFoundException(
                `Операция ${operationId} не найдена: статус живёт час после ` +
                    `завершения, либо домен указан неверно.`,
            );
        }
        return operation;
    }
}
