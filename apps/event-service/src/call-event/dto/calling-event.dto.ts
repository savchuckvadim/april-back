import {
    IsString,
    IsInt,
    IsOptional,
    IsBoolean,
    ValidateNested,
    IsArray,
    IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    CallingCommunicationType,
    CallingEventType,
    CallingInitiative,
    CallingResultStatus,
} from '../types/calling-event.enum';

/** Пара «имя + код» справочного значения (тип события/коммуникации/инициатива). */
class CallingNameCodeDto {
    @ApiProperty({ description: 'Человекочитаемое имя значения', example: 'Звонок' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Код значения', example: 'call' })
    @IsString()
    code: string;
}

/** Обёртка справочного значения с активным элементом `current`. */
class CallingCurrentDto {
    @ApiProperty({
        description: 'Текущее (выбранное) справочное значение',
        type: CallingNameCodeDto,
    })
    @ValidateNested()
    @Type(() => CallingNameCodeDto)
    current: CallingNameCodeDto;
}

/** Ссылка на сущность Bitrix по ID. */
class CallingIdDto {
    @ApiProperty({ description: 'ID сущности в Bitrix', example: 123 })
    @IsInt()
    ID: number;
}

/** Тип и инициатива коммуникации. */
class CallingCommunicationDto {
    @ApiPropertyOptional({
        description: 'Тип коммуникации (звонок/выезд/письмо/ЭДО/СС)',
        type: CallingNameCodeDto,
        example: { name: 'Звонок', code: CallingCommunicationType.call },
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingNameCodeDto)
    type?: CallingNameCodeDto;

    @ApiPropertyOptional({
        description: 'Инициатива коммуникации (входящая/исходящая)',
        type: CallingNameCodeDto,
        example: { name: 'Исходящий', code: CallingInitiative.outgoing },
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingNameCodeDto)
    initiative?: CallingNameCodeDto;
}

/** Запланированное событие (новая задача). */
class CallingPlanDto {
    @ApiProperty({
        description: 'Срок выполнения (DEADLINE) в формате Bitrix',
        example: '12.06.2026 10:00:00',
    })
    @IsString()
    deadline: string;

    @ApiProperty({ description: 'Название/тема плана', example: 'Обучение по продукту' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Постановщик задачи', type: CallingIdDto })
    @ValidateNested()
    @Type(() => CallingIdDto)
    createdBy: CallingIdDto;

    @ApiProperty({ description: 'Ответственный за задачу', type: CallingIdDto })
    @ValidateNested()
    @Type(() => CallingIdDto)
    responsibility: CallingIdDto;

    @ApiPropertyOptional({ description: 'Контакт, связанный с планом', type: CallingIdDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingIdDto)
    contact?: CallingIdDto;

    @ApiProperty({
        description: 'Тип запланированного события',
        type: CallingCurrentDto,
    })
    @ValidateNested()
    @Type(() => CallingCurrentDto)
    type: CallingCurrentDto;

    @ApiProperty({
        description: 'Активен ли план (true — ставим/переносим задачу)',
        example: true,
    })
    @IsBoolean()
    isActive: boolean;

    @ApiProperty({
        description: 'Просрочен ли план (перенос/несостоявшееся событие)',
        example: false,
    })
    @IsBoolean()
    isExpired: boolean;

    @ApiPropertyOptional({
        description: 'Запланировано ли событие',
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    isPlanned?: boolean;

    @ApiProperty({
        description: 'Тип и инициатива коммуникации плана',
        type: CallingCommunicationDto,
    })
    @ValidateNested()
    @Type(() => CallingCommunicationDto)
    communication: CallingCommunicationDto;
}

/** Флаги результатов отчёта (какие события состоялись). */
class CallingReportResultsDto {
    @ApiProperty({ description: 'Проведено обучение', example: false })
    @IsBoolean()
    edu: boolean;

    @ApiProperty({ description: 'Проведено первичное обучение', example: false })
    @IsBoolean()
    edu_first: boolean;

    @ApiProperty({ description: 'Проведена презентация', example: false })
    @IsBoolean()
    presentation: boolean;

    @ApiProperty({ description: 'Обработан сервисный сигнал', example: false })
    @IsBoolean()
    signal: boolean;
}

/** Отчёт по состоявшейся коммуникации. */
class CallingReportDto {
    @ApiPropertyOptional({
        description: 'Итоговый статус звонка',
        enum: CallingResultStatus,
        example: CallingResultStatus.result,
    })
    @IsOptional()
    @IsEnum(CallingResultStatus)
    resultStatus?: CallingResultStatus;

    @ApiProperty({ description: 'Комментарий менеджера по звонку', example: 'Договорились о встрече' })
    @IsString()
    description: string;

    @ApiProperty({ description: 'Флаги состоявшихся событий', type: CallingReportResultsDto })
    @ValidateNested()
    @Type(() => CallingReportResultsDto)
    results: CallingReportResultsDto;

    @ApiPropertyOptional({ description: 'Контакт, по которому отчёт', type: CallingIdDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingIdDto)
    contact?: CallingIdDto;

    @ApiProperty({
        description: 'Тип и инициатива коммуникации отчёта',
        type: CallingCommunicationDto,
    })
    @ValidateNested()
    @Type(() => CallingCommunicationDto)
    communication: CallingCommunicationDto;
}

/** Текущая задача, по которой менеджер отчитывается. */
export class CallingCurrentTaskDto {
    @ApiProperty({ description: 'ID задачи', example: 5512 })
    @IsInt()
    id: number;

    @ApiProperty({
        description: 'CRM-привязки задачи (CO_/D_/C_)',
        type: [String],
        example: ['CO_79753', 'D_74731'],
    })
    @IsArray()
    @IsString({ each: true })
    ufCrmTask: string[];

    @ApiProperty({ description: 'Заголовок задачи', example: 'Обучение: April' })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Тип события задачи (DTO-код)',
        enum: CallingEventType,
        example: CallingEventType.edu,
    })
    @IsString()
    eventType: string;

    @ApiProperty({ description: 'Человекочитаемый тип задачи', example: 'Обучение' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'Имя/тема задачи', example: 'April' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'ID ответственного за задачу', example: 187 })
    @IsInt()
    responsibleId: number;
}

/** Привязка приложения (CALL_CARD): идентификатор сущности. */
class CallingPlacementOptionsDto {
    @ApiProperty({ description: 'ID компании (placement.options.ID)', example: 79753 })
    @IsInt()
    ID: number;
}

class CallingPlacementDto {
    @ApiProperty({ description: 'Опции размещения приложения', type: CallingPlacementOptionsDto })
    @ValidateNested()
    @Type(() => CallingPlacementOptionsDto)
    options: CallingPlacementOptionsDto;
}

/** Текущий пользователь (отдел). */
class CallingDepartamentUserDto {
    @ApiProperty({ description: 'ID текущего пользователя', example: 187 })
    @IsInt()
    ID: number;
}

class CallingDepartamentDto {
    @ApiProperty({ description: 'Текущий пользователь, инициировавший событие', type: CallingDepartamentUserDto })
    @ValidateNested()
    @Type(() => CallingDepartamentUserDto)
    currentUser: CallingDepartamentUserDto;
}

/** CRM-идентификаторы события. */
class CallingBxDto {
    @ApiPropertyOptional({ description: 'ID сделки', example: 74731 })
    @IsOptional()
    @IsInt()
    dealId?: number;

    @ApiPropertyOptional({ description: 'ID компании', example: 79753 })
    @IsOptional()
    @IsInt()
    companyId?: number;

    @ApiPropertyOptional({ description: 'ID группы задач (воронки звонков)', example: 34 })
    @IsOptional()
    @IsInt()
    taskGroupId?: number;
}

/** Входное событие звонка отдела сервиса (хук Bitrix). */
export class CallingEventDto {
    @ApiProperty({ description: 'Домен портала Bitrix', example: 'april.bitrix24.ru' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'Отчёт по состоявшейся коммуникации', type: CallingReportDto })
    @ValidateNested()
    @Type(() => CallingReportDto)
    report: CallingReportDto;

    @ApiProperty({ description: 'Запланированное событие', type: CallingPlanDto })
    @ValidateNested()
    @Type(() => CallingPlanDto)
    plan: CallingPlanDto;

    @ApiProperty({ description: 'Привязка приложения (CALL_CARD)', type: CallingPlacementDto })
    @ValidateNested()
    @Type(() => CallingPlacementDto)
    placement: CallingPlacementDto;

    @ApiPropertyOptional({ description: 'Текущая задача, по которой отчёт', type: CallingCurrentTaskDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => CallingCurrentTaskDto)
    currentTask?: CallingCurrentTaskDto;

    @ApiProperty({ description: 'Отдел / текущий пользователь', type: CallingDepartamentDto })
    @ValidateNested()
    @Type(() => CallingDepartamentDto)
    departament: CallingDepartamentDto;

    @ApiProperty({ description: 'CRM-идентификаторы события', type: CallingBxDto })
    @ValidateNested()
    @Type(() => CallingBxDto)
    bx: CallingBxDto;
}
