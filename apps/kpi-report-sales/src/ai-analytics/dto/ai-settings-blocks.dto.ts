import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    AI_ABSENCE_KINDS,
    AI_MANAGER_LEVELS,
    AI_PORTAL_EVENT_KINDS,
    AI_PORTAL_EVENT_SOURCES,
    AI_SETTINGS_LIMITS,
    type AiAbsenceKind,
    type AiManagerLevelCode,
    type AiPortalEventKind,
    type AiPortalEventSource,
} from '@lib/sales-ai-analytics/settings/ai-settings.types';

/** YYYY-MM-DD — единственный формат дат в настройках. */
export const AI_SETTINGS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = { message: 'дата должна быть в формате YYYY-MM-DD' };

/** Цель одного уровня: продажи в месяц, минимум презентаций, холодные. */
export class AiLevelTargetDto {
    @ApiProperty({
        description: 'Уровень (он же полоса стажа), к которому относится цель.',
        enum: AI_MANAGER_LEVELS,
        example: 'junior',
    })
    @IsIn(AI_MANAGER_LEVELS)
    level: AiManagerLevelCode;

    @ApiPropertyOptional({
        description:
            'Цель продаж в месяц. Не задана (null) — считается медианой ' +
            'полосы стажа за 3 месяца.',
        type: Number,
        example: 3,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    sales?: number | null;

    @ApiProperty({
        description:
            'Обучающий минимум презентаций в месяц (новичку — 20, ' +
            'остальным 0 по умолчанию).',
        type: Number,
        example: 20,
    })
    @IsNumber()
    presentationsMin: number;

    @ApiProperty({
        description: 'Дневной минимум холодных звонков уровня.',
        type: Number,
        example: 40,
    })
    @IsNumber()
    coldPerDay: number;
}

/** Личная цель менеджера поверх цели уровня. */
export class AiTargetOverrideDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера из периметра requester’а.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    managerId: number;

    @ApiPropertyOptional({
        description: 'Личная цель продаж; null — снять переопределение.',
        type: Number,
        example: 5,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    sales?: number | null;
}

/** Блок целей: цели уровней и личные переопределения. */
export class AiTargetsDto {
    @ApiProperty({
        description: 'Цели по уровням (полный список; уровни не дублируются).',
        type: [AiLevelTargetDto],
    })
    @IsArray()
    @ArrayMaxSize(AI_MANAGER_LEVELS.length)
    @ValidateNested({ each: true })
    @Type(() => AiLevelTargetDto)
    byLevel: AiLevelTargetDto[];

    @ApiPropertyOptional({
        description: 'Личные цели менеджеров; пусто — только цели уровней.',
        type: [AiTargetOverrideDto],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_SETTINGS_LIMITS.levelsMax)
    @ValidateNested({ each: true })
    @Type(() => AiTargetOverrideDto)
    overrides?: AiTargetOverrideDto[];
}

/** Один отрезок отсутствия менеджера (включительно). */
export class AiAbsenceDto {
    @ApiProperty({
        description: 'Первый день отсутствия.',
        type: String,
        example: '2026-07-01',
    })
    @Matches(AI_SETTINGS_DATE_PATTERN, DATE_MESSAGE)
    from: string;

    @ApiProperty({
        description: 'Последний день отсутствия (не раньше from).',
        type: String,
        example: '2026-07-14',
    })
    @Matches(AI_SETTINGS_DATE_PATTERN, DATE_MESSAGE)
    to: string;

    @ApiProperty({
        description: 'Вид отсутствия.',
        enum: AI_ABSENCE_KINDS,
        example: 'vacation',
    })
    @IsIn(AI_ABSENCE_KINDS)
    kind: AiAbsenceKind;
}

/** Отсутствия одного менеджера (полный список, заменяет предыдущий). */
export class AiManagerAbsencesDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    managerId: number;

    @ApiProperty({
        description: 'Отрезки отсутствий; не пересекаются между собой.',
        type: [AiAbsenceDto],
    })
    @IsArray()
    @ArrayMaxSize(100)
    @ValidateNested({ each: true })
    @Type(() => AiAbsenceDto)
    items: AiAbsenceDto[];
}

/** Запись журнала событий портала. */
export class AiPortalEventDto {
    @ApiProperty({
        description: 'Дата события.',
        type: String,
        example: '2026-09-05',
    })
    @Matches(AI_SETTINGS_DATE_PATTERN, DATE_MESSAGE)
    date: string;

    @ApiProperty({
        description:
            'Вид события: приход новичка, смена рубрики/скрипта/цены, ' +
            'автоотметка разрыва ряда, произвольная запись.',
        enum: AI_PORTAL_EVENT_KINDS,
        example: 'script_change',
    })
    @IsIn(AI_PORTAL_EVENT_KINDS)
    kind: AiPortalEventKind;

    @ApiPropertyOptional({
        description: 'Комментарий руководителя.',
        type: String,
        example: 'Новый скрипт холодного звонка',
    })
    @IsOptional()
    @IsString()
    note?: string;

    @ApiProperty({
        description: 'Кто записал: человек или система.',
        enum: AI_PORTAL_EVENT_SOURCES,
        example: 'manual',
    })
    @IsIn(AI_PORTAL_EVENT_SOURCES)
    source: AiPortalEventSource;
}
