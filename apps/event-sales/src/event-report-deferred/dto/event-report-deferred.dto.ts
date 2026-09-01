import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMinSize,
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';
import { EventSalesFlowDto } from '../../event-report/dto/event-sale-flow/event-sales-flow.dto';

/**
 * Виды шагов ДОСЫЛКИ (хвоста прямого исполнения). Значения совпадают с
 * `DeferredFlowStep['kind']` фронтового пакета `@workspace/event-sales-flow`
 * (`use-cases/execute-event-report.use-case.ts`) — это КОНТРАКТ, и разъезд
 * значений здесь ломает досылку молча.
 */
export const EnumDeferredFlowStepKind = {
    /** Записи KPI/History по событию (у серверного KPI-flow свой дедуп). */
    kpi: 'kpi',
    /** Движения сделок воронки «ОП Презентации». */
    presDeals: 'pres-deals',
    /** Движения сделок воронки «ОП Холодные» (ХО). */
    xoDeals: 'xo-deals',
    /** Постановка сайд-джоба смарта (ЗПР либо «Презентации»). */
    sideFlow: 'side-flow',
    /** Синхронизация связанных заявок/лидов (статусы + история). */
    leadRequestSync: 'lead-request-sync',
    /** im-уведомление ответственному о переносе звонка. */
    transferNotify: 'transfer-notify',
} as const;

export type DeferredFlowStepKind =
    (typeof EnumDeferredFlowStepKind)[keyof typeof EnumDeferredFlowStepKind];

export const DEFERRED_FLOW_STEP_KINDS = Object.values(
    EnumDeferredFlowStepKind,
) as DeferredFlowStepKind[];

/**
 * Поток сайд-джоба. Значения = `SideFlowQueueSpec.flow` координатора
 * сайд-очередей (часть детерминированного jobId `{operationId}:{flow}:{kind}`).
 */
export const EnumDeferredSideFlow = {
    zpr: 'zpr',
    pres: 'pres',
} as const;

export type DeferredSideFlow =
    (typeof EnumDeferredSideFlow)[keyof typeof EnumDeferredSideFlow];

export const DEFERRED_SIDE_FLOWS = Object.values(
    EnumDeferredSideFlow,
) as DeferredSideFlow[];

/**
 * Верхняя граница списка шагов. Видов шагов шесть, сайд-flow бывает двух
 * потоков — больше восьми осмысленных шагов в одном конверте не бывает;
 * запас взят вдвое, чтобы кривой клиент не заставил сервер ходить в Битрикс
 * сотню раз.
 */
export const DEFERRED_STEPS_MAX = 16;

/**
 * Один СЕМАНТИЧЕСКИЙ шаг досылки. Данные шага НЕ дублируются — сервер
 * пересобирает их из `payload` (см. {@link EventReportDeferredRequestDto}).
 * Поля `flow`/`addedTaskId`/`createdPresDealId` осмысленны только у
 * `side-flow`; у прочих видов игнорируются.
 */
export class DeferredFlowStepDto {
    @ApiProperty({
        description:
            'Вид шага досылки. Всё, чего нет в списке, отвергается 400 — ' +
            'ядро отчёта (сущности, задача, история) через эту ручку не ' +
            'исполняется никогда.',
        enum: DEFERRED_FLOW_STEP_KINDS,
        example: EnumDeferredFlowStepKind.kpi,
    })
    @IsIn(DEFERRED_FLOW_STEP_KINDS)
    kind: DeferredFlowStepKind;

    @ApiPropertyOptional({
        description:
            'Поток сайд-джоба: `zpr` — смарт «Звонки По решению», `pres` — ' +
            'смарт «Презентации» (носитель анкеты отчёта). Обязателен при ' +
            '`kind=side-flow`, у прочих видов игнорируется.',
        enum: DEFERRED_SIDE_FLOWS,
        example: EnumDeferredSideFlow.pres,
    })
    @IsOptional()
    @IsIn(DEFERRED_SIDE_FLOWS)
    flow?: DeferredSideFlow;

    @ApiPropertyOptional({
        description:
            'id план-задачи, СОЗДАННОЙ прямым батчем браузера (он же прочитал ' +
            'его из ответа своего батча). Сервер задач не создаёт и взять ' +
            'этот id больше неоткуда: без него плановый элемент смарта ' +
            'уедет без привязки к задаче. null — плана не было.',
        type: Number,
        nullable: true,
        example: 987654,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    addedTaskId?: number | null;

    @ApiPropertyOptional({
        description:
            'id pres-сделки, СОЗДАННОЙ прямым батчем браузера. Фолбэк — ' +
            'сделка, созданная батчем ЭТОЙ ручки (шаг `pres-deals` в том же ' +
            'запросе). null — сделку этот отчёт не создавал.',
        type: Number,
        nullable: true,
        example: 1024,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    createdPresDealId?: number | null;
}

/**
 * Досылка ХВОСТА прямого исполнения отчёта (план А5).
 *
 * Ядро отчёта (сущности, задача, история) УЖЕ исполнено браузером —
 * повторять его нельзя, поэтому исходный payload сюда едет только как
 * ИСТОЧНИК ДАННЫХ для перечисленных шагов, а не как команда «выполни
 * отчёт». Слать этот payload в обычный `POST /event-sales/flow` после
 * прямого исполнения ЗАПРЕЩЕНО (бэк прямого исполнения не видел и выполнил
 * бы отчёт второй раз целиком).
 */
export class EventReportDeferredRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiProperty({
        description:
            'Идентификатор операции отчёта — ключ идемпотентности досылки: ' +
            'повтор той же пары (operationId, шаг) не выполняется второй раз.',
        example: 'e1c1a1f0-0000-4000-8000-000000000001',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    operationId: string;

    @ApiProperty({
        description:
            'Шаги хвоста. Пустой список отвергается 400: досылать нечего, ' +
            'а поход в Битрикс за контекстом стоил бы запрос впустую.',
        type: [DeferredFlowStepDto],
    })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(DEFERRED_STEPS_MAX)
    @ValidateNested({ each: true })
    @Type(() => DeferredFlowStepDto)
    steps: DeferredFlowStepDto[];

    @ApiProperty({
        description:
            'ИСХОДНЫЙ payload отчёта — тот же `EventSalesFlowDto`, что у ' +
            '`POST /event-sales/flow`. Из него сервер пересобирает работу ' +
            'шагов (данные шагов не дублируются).',
        type: EventSalesFlowDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => EventSalesFlowDto)
    payload: EventSalesFlowDto;

    @ApiPropertyOptional({
        description:
            'Сокет клиента: уезжает в сайд-джобы, чтобы их `…:done` вернулся ' +
            'точечно той же вкладке.',
        type: String,
        example: 'AbC123',
    })
    @IsOptional()
    @IsString()
    socketId?: string;
}

/** Исход одного шага досылки. */
export const EnumDeferredStepStatus = {
    /** Шаг выполнен этим запросом. */
    executed: 'executed',
    /** Шаг уже выполнялся раньше (дедуп по operationId) — повтора нет. */
    duplicate: 'duplicate',
    /** Шаг не выполнен; отметка снята — фронт вправе повторить именно его. */
    failed: 'failed',
} as const;

export type DeferredStepStatus =
    (typeof EnumDeferredStepStatus)[keyof typeof EnumDeferredStepStatus];

export const DEFERRED_STEP_STATUSES = Object.values(
    EnumDeferredStepStatus,
) as DeferredStepStatus[];

/** Строка итога по одному шагу. */
export class DeferredStepOutcomeDto {
    @ApiProperty({
        description: 'Вид шага.',
        enum: DEFERRED_FLOW_STEP_KINDS,
        example: EnumDeferredFlowStepKind.kpi,
    })
    kind: DeferredFlowStepKind;

    @ApiPropertyOptional({
        description: 'Поток сайд-джоба (только у `kind=side-flow`).',
        enum: DEFERRED_SIDE_FLOWS,
        example: EnumDeferredSideFlow.pres,
    })
    flow?: DeferredSideFlow;

    @ApiProperty({
        description:
            'Исход: `executed` — выполнен сейчас, `duplicate` — уже был ' +
            'выполнен, `failed` — упал (причина в `detail`).',
        enum: DEFERRED_STEP_STATUSES,
        example: EnumDeferredStepStatus.executed,
    })
    status: DeferredStepStatus;

    @ApiPropertyOptional({
        description: 'Причина падения либо пояснение к исходу.',
        type: String,
        example: 'ACCESS_DENIED: Access denied',
    })
    detail?: string;
}

/**
 * Итог досылки. Фронт гасит конверт целиком, когда `pending` пуст; иначе
 * оставляет в конверте ровно шаги со статусом `failed`.
 */
export class EventReportDeferredResultDto {
    @ApiProperty({
        description: 'Запрос принят и обработан.',
        example: true,
        type: Boolean,
    })
    accepted: boolean;

    @ApiProperty({
        description: 'Идентификатор операции отчёта.',
        example: 'e1c1a1f0-0000-4000-8000-000000000001',
        type: String,
    })
    operationId: string;

    @ApiProperty({
        description:
            'Исход КАЖДОГО присланного шага, в порядке присланных шагов.',
        type: [DeferredStepOutcomeDto],
    })
    steps: DeferredStepOutcomeDto[];

    @ApiProperty({
        description:
            'Все шаги завершены (executed либо duplicate) — конверт можно ' +
            'гасить целиком.',
        example: true,
        type: Boolean,
    })
    completed: boolean;

    @ApiProperty({
        description:
            'Шаги, которые НЕ выполнены и подлежат повтору (статус `failed`).',
        type: [String],
        example: [],
    })
    pending: string[];

    @ApiProperty({
        description:
            'Сколько команд Битрикса выполнил батч досылки (KPI + движения ' +
            'сделок). Сайд-джобы и im-уведомление сюда не входят.',
        example: 6,
        type: Number,
    })
    commandsCount: number;

    @ApiProperty({
        description: 'Предупреждения мягкой деградации.',
        type: [String],
        example: [],
    })
    warnings: string[];
}
