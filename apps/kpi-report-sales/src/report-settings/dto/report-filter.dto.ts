import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator';

/** Актуальная версия структурного формата сохранённого фильтра. */
export const REPORT_FILTER_VERSION = 2;

/** Режим дат фильтра: пресет либо произвольный период. */
export enum EReportFilterDateMode {
    today = 'today',
    week = 'week',
    month = 'month',
    custom = 'custom',
}

export class ReportFilterDatesDto {
    @ApiProperty({
        enum: EReportFilterDateMode,
        description:
            'Режим дат: пресет (today/week/month) или custom — произвольный период из from/to.',
        example: EReportFilterDateMode.month,
    })
    @IsEnum(EReportFilterDateMode)
    mode: EReportFilterDateMode;

    @ApiProperty({
        description: 'Начало периода (ISO), только для mode=custom.',
        type: String,
        required: false,
        nullable: true,
        example: '2026-07-01',
    })
    @IsOptional()
    @ValidateIf((dto: ReportFilterDatesDto) => dto.from !== null)
    @IsString()
    from?: string | null;

    @ApiProperty({
        description: 'Конец периода (ISO), только для mode=custom.',
        type: String,
        required: false,
        nullable: true,
        example: '2026-07-31',
    })
    @IsOptional()
    @ValidateIf((dto: ReportFilterDatesDto) => dto.to !== null)
    @IsString()
    to?: string | null;
}

export class ReportFilterGroupSelectionDto {
    @ApiProperty({ description: 'ID группы (отдела Bitrix).', type: Number })
    @IsInt()
    id: number;

    @ApiProperty({
        description:
            'Группа выбрана целиком. При true userIds можно не передавать.',
        type: Boolean,
    })
    @IsBoolean()
    all: boolean;

    @ApiProperty({
        description: 'Точечно выбранные сотрудники группы (при all=false).',
        type: [Number],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    userIds?: number[];
}

export class ReportFilterDepartmentSelectionDto {
    @ApiProperty({
        description: 'ID отдела продаж (отдела Bitrix).',
        type: Number,
    })
    @IsInt()
    id: number;

    @ApiProperty({
        description:
            'Отдел выбран целиком со всеми группами. При true groups/userIds можно не передавать.',
        type: Boolean,
    })
    @IsBoolean()
    all: boolean;

    @ApiProperty({
        description: 'Выбор по группам внутри отдела (при all=false).',
        type: [ReportFilterGroupSelectionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportFilterGroupSelectionDto)
    groups: ReportFilterGroupSelectionDto[];

    @ApiProperty({
        description:
            'Точечно выбранные сотрудники отдела вне групп (при all=false).',
        type: [Number],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @IsNumber({}, { each: true })
    userIds?: number[];
}

export class ReportFilterSelectionDto {
    @ApiProperty({
        description:
            'Структурный выбор по отделам. Отсутствующий в списке отдел считается невыбранным.',
        type: [ReportFilterDepartmentSelectionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportFilterDepartmentSelectionDto)
    departments: ReportFilterDepartmentSelectionDto[];
}

export class SavedReportFilterDto {
    @ApiProperty({
        description:
            'Версия формата. 2 — структурный выбор (selection). 1 — legacy-запись, конвертированная из старых колонок: selection=null, выбор в legacyUserIds.',
        type: Number,
        example: REPORT_FILTER_VERSION,
    })
    @IsInt()
    @Min(1)
    version: number;

    @ApiProperty({
        description: 'innerCode выбранных действий отчёта.',
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    actions: string[];

    @ApiProperty({ description: 'Даты фильтра.', type: ReportFilterDatesDto })
    @ValidateNested()
    @Type(() => ReportFilterDatesDto)
    dates: ReportFilterDatesDto;

    @ApiProperty({
        description:
            'Структурный выбор отделов/групп/сотрудников. null — только legacy-выбор (см. legacyUserIds).',
        type: ReportFilterSelectionDto,
        nullable: true,
    })
    @ValidateIf((dto: SavedReportFilterDto) => dto.selection !== null)
    @ValidateNested()
    @Type(() => ReportFilterSelectionDto)
    selection: ReportFilterSelectionDto | null;

    @ApiProperty({
        description:
            'Развёрнутый плоский список выбранных сотрудников. При save обязателен для зеркалирования в legacy-колонки (старый фронт продолжает работать); при get из legacy-записи — единственный источник выбора.',
        type: [Number],
        nullable: true,
    })
    @ValidateIf((dto: SavedReportFilterDto) => dto.legacyUserIds !== null)
    @IsArray()
    @IsNumber({}, { each: true })
    legacyUserIds: number[] | null;
}

export class ReportFilterGetRequestDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        type: String,
        example: 'garant-vrn.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'ID пользователя Bitrix24.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    userId: number;
}

export class ReportFilterGetResponseDto {
    @ApiProperty({
        description:
            'Сохранённый фильтр. null — пользователь ещё ничего не сохранял.',
        type: SavedReportFilterDto,
        nullable: true,
    })
    @ValidateIf((dto: ReportFilterGetResponseDto) => dto.filter !== null)
    @ValidateNested()
    @Type(() => SavedReportFilterDto)
    filter: SavedReportFilterDto | null;
}

export class ReportFilterSaveRequestDto extends ReportFilterGetRequestDto {
    @ApiProperty({
        description: 'Фильтр для сохранения.',
        type: SavedReportFilterDto,
    })
    @ValidateNested()
    @Type(() => SavedReportFilterDto)
    filter: SavedReportFilterDto;
}

export class ReportFilterSaveResponseDto {
    @ApiProperty({ description: 'Фильтр сохранён.', type: Boolean })
    @IsBoolean()
    saved: boolean;
}

export class ReportFilterResetResponseDto {
    @ApiProperty({
        description:
            'Сохранённый фильтр сброшен (false — записи и не было). ' +
            'UI-настройки (колонка other) не затрагиваются.',
        type: Boolean,
    })
    @IsBoolean()
    reset: boolean;
}
