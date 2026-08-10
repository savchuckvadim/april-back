import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsIn,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    EnumLeadNotCaTypeCode,
    LEAD_NOT_CA_TYPE_CODES,
} from '@lib/portal-lib/pbx/pbx-lead-request/type/pbx-lead-request.enum';
import { IBXDeal } from 'src/modules/bitrix';
import { PlanDto } from './plan.dto';
import { ReportDto } from './report.dto';
import { EventTaskDto } from './task.dto';
import { PlacementDto } from './placement.dto';
import { EvFlowContextDto } from './flow-context.dto';
import { ContactDto } from './contact.dto';
import { SaleDto } from './sale.dto';
import { DepartamentDto } from './department.dto';
import { FailDto } from './fail.dto';
import { LeadDto } from './lead.dto';
import { PresentationDto } from './presentation.dto';

/**
 * TMC-сделка для возврата (legacy-тип фронта `TmcDealsForReturn`:
 * `{ taskId, tmcDeal, presDeal? }`).
 */
export class TmcDealForReturnDto {
    @ApiPropertyOptional({
        description: 'Идентификатор задачи Bitrix, к которой привязана сделка.',
        type: Number,
        example: 1024,
    })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    taskId?: number;

    @ApiPropertyOptional({
        description:
            'TMC-сделка Bitrix (`IBXDeal`). Структура соответствует сделке Bitrix.',
        type: Object,
        example: { ID: '123', TITLE: 'ТМЦ Иванов', STAGE_ID: 'C5:NEW' },
    })
    @IsOptional()
    @IsObject()
    tmcDeal?: IBXDeal;

    @ApiPropertyOptional({
        description: 'Связанная сделка-презентация (`IBXDeal`), если есть.',
        type: Object,
        nullable: true,
        example: { ID: '124', TITLE: 'Презентация Иванов', STAGE_ID: 'C7:WON' },
    })
    @IsOptional()
    @IsObject()
    presDeal?: IBXDeal | null;
}

/**
 * Синхронизация связанной заявки/лида при финальном событии (отказ или
 * продажа): фронт испрашивает у менеджера недостающие статусы («не ЦА» —
 * при отказе) и передаёт их сюда; бэк двигает op_lead_site_* / op_lead_status
 * связанных лидов и дописывает историю обработки заявки.
 */
export class LeadRequestSyncDto {
    @ApiPropertyOptional({
        description:
            'Тип «не ЦА» — обязателен, когда менеджер квалифицирует отказ ' +
            'как «не ЦА». Пустой при обычном отказе или продаже.',
        type: String,
        enum: LEAD_NOT_CA_TYPE_CODES,
        example: EnumLeadNotCaTypeCode.noSpecialists,
    })
    @IsOptional()
    @IsIn(LEAD_NOT_CA_TYPE_CODES)
    notCaTypeCode?: EnumLeadNotCaTypeCode;

    @ApiPropertyOptional({
        description:
            'Произвольная заметка менеджера — попадёт строкой в историю ' +
            'обработки заявки (op_lead_firstprepare_history).',
        type: String,
        example: 'Клиент просил не звонить до сентября',
    })
    @IsOptional()
    @IsString()
    note?: string;
}

/** Возврат сущности в ТМЦ. */
export class ReturnToTmcDto {
    @ApiPropertyOptional({
        description:
            'Найденная TMC-сделка для возврата (legacy `TmcDealsForReturn`). ' +
            'Legacy-фронт может прислать вместо объекта falsy-значение ' +
            '(false/0/null), поэтому строгая валидация поля не выполняется.',
        type: TmcDealForReturnDto,
        nullable: true,
    })
    @IsOptional()
    data?: TmcDealForReturnDto | boolean | null;

    @ApiPropertyOptional({
        description: 'Признак активности ветки возврата в ТМЦ.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

export class EventSalesFlowDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix клиента. По нему `PBXService.init` отдаёт ' +
            'инстанс bitrix и портал с ключами доступа.',
        type: String,
        example: 'client.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Идентификатор операции, сгенерированный клиентом (UUID). Отчёт — ' +
            'команда: повторный POST с тем же id не выполнит её второй раз, а ' +
            'вернёт статус уже принятой операции. Не передан — сервер выдаст свой.',
        type: String,
        example: '0f2b7d0e-2a1e-4a63-9a0a-9f1f2a3b4c5d',
    })
    @IsOptional()
    @IsString()
    operationId?: string;

    @ApiPropertyOptional({
        description:
            'socket.io-идентификатор клиента: на него уйдёт push с исходом ' +
            'операции. Не передан — клиент узнает результат поллингом статуса.',
        type: String,
        example: 'kM3xM0Ib9v0nQz1TAAAB',
    })
    @IsOptional()
    @IsString()
    socketId?: string;

    @ApiPropertyOptional({
        description: 'План звонка: тип, ответственный, дедлайн, контакт.',
        type: PlanDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => PlanDto)
    plan: PlanDto;

    @ApiPropertyOptional({
        description: 'Отчёт по событию: статус результата, причины, контакт.',
        type: ReportDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => ReportDto)
    report: ReportDto;

    @ApiPropertyOptional({
        description: 'Текущая задача, по которой отчитывается менеджер.',
        type: EventTaskDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => EventTaskDto)
    currentTask?: EventTaskDto;

    @ApiPropertyOptional({
        description:
            'Честный контекст встройки: тип + id сущностей. Приоритетный ' +
            'источник владельца события; `placement` остаётся только как ' +
            'фолбэк для старых клиентов.',
        type: EvFlowContextDto,
    })
    @IsOptional()
    @IsObject()
    @ValidateNested()
    @Type(() => EvFlowContextDto)
    context?: EvFlowContextDto;

    /** @deprecated Владельца события описывает `context`; поле держим для BC. */
    @ApiPropertyOptional({
        description:
            'Контекст встройки Bitrix (placement), из которой пришло событие. ' +
            'Deprecated: старые клиенты подделывали здесь CRM_COMPANY_DETAIL_TAB; ' +
            'новые шлют реальный placement и `context`.',
        type: PlacementDto,
        deprecated: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PlacementDto)
    placement?: PlacementDto;

    @ApiPropertyOptional({
        description: 'Контакт события. `null`, если контакт не выбран.',
        type: ContactDto,
        nullable: true,
    })
    @IsOptional()
    @Type(() => ContactDto)
    contact?: ContactDto | null;

    @ApiPropertyOptional({
        description:
            'Данные продажи (связка презентация ↔ сделка). `null`, если нет.',
        type: SaleDto,
        nullable: true,
    })
    @IsOptional()
    @Type(() => SaleDto)
    sale?: SaleDto | null;

    @ApiPropertyOptional({
        description: 'Подразделение/режим, в котором выполняется flow.',
        type: DepartamentDto,
    })
    @IsOptional()
    @Type(() => DepartamentDto)
    departament?: DepartamentDto;

    @ApiPropertyOptional({
        description: 'Параметры пост-фейл обработки (дата повторного касания).',
        type: FailDto,
    })
    @IsOptional()
    @Type(() => FailDto)
    fail?: FailDto;

    @ApiPropertyOptional({
        description: 'Признак пост-продажного сценария.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    isPostSale?: boolean;

    @ApiPropertyOptional({
        description: 'Параметры возврата сущности в ТМЦ.',
        type: ReturnToTmcDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ReturnToTmcDto)
    returnToTmc?: ReturnToTmcDto;

    @ApiPropertyOptional({
        description: 'Лид, связанный с событием.',
        type: LeadDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LeadDto)
    lead?: LeadDto;

    @ApiProperty({
        description: 'Данные презентации: счётчики и флаги проведения.',
        type: PresentationDto,
    })
    @ValidateNested()
    @Type(() => PresentationDto)
    presentation: PresentationDto;

    @ApiPropertyOptional({
        description:
            'Синхронизация связанной заявки при финале (отказ/продажа): ' +
            'тип «не ЦА», заметка в историю обработки.',
        type: LeadRequestSyncDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LeadRequestSyncDto)
    leadSync?: LeadRequestSyncDto;
}
