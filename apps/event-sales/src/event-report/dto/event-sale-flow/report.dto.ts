import {
    EnumEventItemResultType,
    EnumWorkStatusCode,
    EnumWorkStatusName,
    WorkStatus,
    NoresultReason,
    FailType,
    FailReason,
} from '../../types/report-types';
import {
    IsBoolean,
    IsEnum,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactDto } from './contact.dto';

/** Runtime-списки кодов справочников отчёта (для @IsIn и Swagger enum). */
export const NORESULT_REASON_CODE_VALUES = [
    'secretar',
    'nopickup',
    'nonumber',
    'busy',
    'noresult_notime',
    'nocontact',
    'giveup',
    'bay',
    'wrong',
    'auto',
] as const satisfies readonly NoresultReason['code'][];

export const FAIL_TYPE_CODE_VALUES = [
    'garant',
    'go',
    'territory',
    'accountant',
    'autsorc',
    'depend',
    'op_prospects_nophone',
    'op_prospects_company',
    'failure',
] as const satisfies readonly FailType['code'][];

export const FAIL_REASON_CODE_VALUES = [
    'fail_notime',
    'c_habit',
    'c_prepay',
    'c_price',
    'to_expensive',
    'to_cheap',
    'nomoney',
    'noneed',
    'lpr',
    'employee',
    'fail_off',
] as const satisfies readonly FailReason['code'][];

/** Текущий статус работы по сущности. */
export class WorkStatusValueDto implements WorkStatus {
    @ApiProperty({
        description: 'Идентификатор статуса.',
        type: Number,
        example: 1,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description: 'Код статуса работы, определяющий ветку flow.',
        enum: EnumWorkStatusCode,
        example: EnumWorkStatusCode.inJob,
    })
    @IsEnum(EnumWorkStatusCode)
    code: EnumWorkStatusCode;

    @ApiProperty({
        description: 'Отображаемое название статуса.',
        enum: EnumWorkStatusName,
        example: EnumWorkStatusName.inJob,
    })
    @IsEnum(EnumWorkStatusName)
    name: EnumWorkStatusName;

    @ApiProperty({
        description: 'Признак активности статуса.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;
}

/** Причина «без результата» (недозвон и т.п.). */
export class NoresultReasonValueDto implements NoresultReason {
    @ApiProperty({
        description: 'Идентификатор причины.',
        type: Number,
        example: 2,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description: 'Код причины отсутствия результата.',
        type: String,
        enum: NORESULT_REASON_CODE_VALUES,
        example: 'nopickup',
    })
    @IsString()
    @IsIn(NORESULT_REASON_CODE_VALUES as unknown as string[])
    code: NoresultReason['code'];

    @ApiProperty({
        description: 'Отображаемое название причины.',
        type: String,
        example: 'Недозвон - трубку не берут',
    })
    @IsString()
    name: NoresultReason['name'];

    @ApiProperty({
        description: 'Признак активности причины.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;
}

/** Тип отказа. */
export class FailTypeValueDto implements FailType {
    @ApiProperty({
        description: 'Идентификатор типа отказа.',
        type: Number,
        example: 9,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description: 'Код типа отказа.',
        type: String,
        enum: FAIL_TYPE_CODE_VALUES,
        example: 'failure',
    })
    @IsString()
    @IsIn(FAIL_TYPE_CODE_VALUES as unknown as string[])
    code: FailType['code'];

    @ApiProperty({
        description: 'Отображаемое название типа отказа.',
        type: String,
        example: 'Отказ',
    })
    @IsString()
    name: FailType['name'];

    @ApiProperty({
        description: 'Признак активности типа отказа.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;
}

/** Причина отказа. */
export class FailReasonValueDto implements FailReason {
    @ApiProperty({
        description: 'Идентификатор причины отказа.',
        type: Number,
        example: 7,
    })
    @IsNumber()
    id: number;

    @ApiProperty({
        description: 'Код причины отказа.',
        type: String,
        enum: FAIL_REASON_CODE_VALUES,
        example: 'nomoney',
    })
    @IsString()
    @IsIn(FAIL_REASON_CODE_VALUES as unknown as string[])
    code: FailReason['code'];

    @ApiProperty({
        description: 'Отображаемое название причины отказа.',
        type: String,
        example: 'Нет денег',
    })
    @IsString()
    name: FailReason['name'];

    @ApiProperty({
        description: 'Признак активности причины отказа.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;
}

export class WorkStatusDto {
    @ApiProperty({
        description: 'Текущий статус работы.',
        type: WorkStatusValueDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => WorkStatusValueDto)
    current: WorkStatus;
}

export class NoresultReasonDto {
    @ApiProperty({
        description: 'Текущая причина отсутствия результата.',
        type: NoresultReasonValueDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => NoresultReasonValueDto)
    current: NoresultReason;
}

export class FailTypeDto {
    @ApiProperty({ description: 'Текущий тип отказа.', type: FailTypeValueDto })
    @IsObject()
    @ValidateNested()
    @Type(() => FailTypeValueDto)
    current: FailType;
}

export class FailReasonDto {
    @ApiProperty({
        description: 'Текущая причина отказа.',
        type: FailReasonValueDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => FailReasonValueDto)
    current: FailReason;
}

export class ReportDto {
    @ApiProperty({
        description:
            'Итоговый статус результата события (`result` / `noresult` / `expired` / `new` / `cancel`).',
        enum: EnumEventItemResultType,
        example: EnumEventItemResultType.RESULT,
    })
    @IsEnum(EnumEventItemResultType)
    @IsNotEmpty()
    resultStatus: EnumEventItemResultType;

    @ApiProperty({
        description: 'Текстовое описание/комментарий отчёта по событию.',
        type: String,
        example: 'Клиент попросил перезвонить завтра',
    })
    @IsString()
    description: string;

    @ApiProperty({
        description: 'Текущий статус работы по сущности.',
        type: WorkStatusDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => WorkStatusDto)
    workStatus: WorkStatusDto;

    @ApiProperty({
        description: 'Причина отсутствия результата (для статуса noresult).',
        type: NoresultReasonDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => NoresultReasonDto)
    noresultReason: NoresultReasonDto;

    @ApiProperty({
        description: 'Тип отказа (для проигранной сделки).',
        type: FailTypeDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => FailTypeDto)
    failType: FailTypeDto;

    @ApiProperty({
        description: 'Причина отказа (для проигранной сделки).',
        type: FailReasonDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => FailReasonDto)
    failReason: FailReasonDto;

    @ApiPropertyOptional({
        description:
            'Контакт, по которому составлен отчёт. `null`, если не задан.',
        type: ContactDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ContactDto)
    contact: ContactDto | null;

    @ApiProperty({
        description:
            'Признак того, что звонок не совершался (отчёт без звонка).',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isNoCall: boolean;
}
