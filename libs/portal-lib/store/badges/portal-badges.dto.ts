import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    BadgeCatalogPayload,
    PortalBadgesAdminPayload,
} from './portal-badges.service';
import {
    BADGE_CATALOG_CONTRACT,
    BADGE_CODE_MAX_LENGTH,
    BADGE_ITEMS_MAX,
    BADGE_MODES,
    BADGE_OUTCOMES,
    BADGE_PLAN_TYPES,
    BADGE_TARGETS,
    BADGE_TEXT_MAX_LENGTH,
    BADGE_TONES,
    BadgeRecord,
    BadgeRegistryOption,
    BadgeSchemaPayload,
    EnumBadgeMode,
    EnumBadgeOutcome,
    EnumBadgePlanType,
    EnumBadgeTarget,
    EnumBadgeTone,
} from './portal-badges.schema';

/**
 * DTO портального каталога бейджиков: реестр для админки (`GET /schema`),
 * тело сохранения, админский ответ (документ + общий набор) и фреймовый
 * ответ (скомпилированный действующий набор).
 */

export class BadgeRegistryOptionDto implements BadgeRegistryOption {
    @ApiProperty({
        description: 'Код значения реестра — его хранит документ и шлёт фрейм.',
        type: String,
        example: 'setAside',
    })
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty({
        description: 'Подпись значения на русском — заголовок в админке.',
        type: String,
        example: 'Отложено',
    })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({
        description: 'Что значение означает и когда применяется.',
        type: String,
        example: 'Клиент просил вернуться позже.',
    })
    @IsString()
    description: string;
}

export class BadgeSchemaDto implements BadgeSchemaPayload {
    @ApiProperty({
        description: 'Версия формы каталога, которую отдаёт бэк.',
        type: Number,
        example: BADGE_CATALOG_CONTRACT,
    })
    @IsInt()
    contract: number;

    @ApiProperty({
        description:
            'Куда вставляется бейджик: комментарий или название события.',
        type: [BadgeRegistryOptionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeRegistryOptionDto)
    targets: BadgeRegistryOptionDto[];

    @ApiProperty({
        description: 'Режимы набора портала: общие по умолчанию или свои.',
        type: [BadgeRegistryOptionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeRegistryOptionDto)
    modes: BadgeRegistryOptionDto[];

    @ApiProperty({
        description:
            'Итоги работы, к которым привязывается бейджик комментария; ' +
            '«presentationDone» — факт проведённой презентации, не статус.',
        type: [BadgeRegistryOptionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeRegistryOptionDto)
    outcomes: BadgeRegistryOptionDto[];

    @ApiProperty({
        description: 'Типы планируемого события для бейджиков названия.',
        type: [BadgeRegistryOptionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeRegistryOptionDto)
    planTypes: BadgeRegistryOptionDto[];

    @ApiProperty({
        description: 'Цвета бейджика — статусные тоны дизайн-системы.',
        type: [BadgeRegistryOptionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeRegistryOptionDto)
    tones: BadgeRegistryOptionDto[];

    @ApiProperty({
        description: 'Предел длины текста бейджика в символах.',
        type: Number,
        example: BADGE_TEXT_MAX_LENGTH,
    })
    @IsInt()
    textMaxLength: number;

    @ApiProperty({
        description: 'Предел размера своего набора портала.',
        type: Number,
        example: BADGE_ITEMS_MAX,
    })
    @IsInt()
    itemsMax: number;
}

export class BadgeItemDto implements BadgeRecord {
    @ApiProperty({
        description:
            'Стабильный код бейджика: по нему запись опознаётся при ' +
            'сохранении и в диагностике фрейма.',
        type: String,
        example: 'aside_call_later',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(BADGE_CODE_MAX_LENGTH)
    code: string;

    @ApiProperty({
        description: 'Текст, который по нажатию встаёт в поле.',
        type: String,
        example: 'Просил перезвонить позже',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(BADGE_TEXT_MAX_LENGTH)
    text: string;

    @ApiProperty({
        description:
            'Куда вставляется: комментарий отчёта или название события.',
        type: String,
        enum: BADGE_TARGETS,
        example: EnumBadgeTarget.comment,
    })
    @IsString()
    @IsIn(BADGE_TARGETS as unknown as string[])
    target: EnumBadgeTarget;

    @ApiProperty({
        description: 'Цвет бейджика — тон дизайн-системы.',
        type: String,
        enum: BADGE_TONES,
        example: EnumBadgeTone.warning,
    })
    @IsString()
    @IsIn(BADGE_TONES as unknown as string[])
    tone: EnumBadgeTone;

    @ApiProperty({
        description:
            'Итоги работы, при которых показывается бейджик комментария; ' +
            'пустой список — всегда. У бейджика названия пуст.',
        type: [String],
        enum: BADGE_OUTCOMES,
        example: [EnumBadgeOutcome.setAside],
    })
    @IsArray()
    @IsString({ each: true })
    @IsIn(BADGE_OUTCOMES as unknown as string[], { each: true })
    outcomes: EnumBadgeOutcome[];

    @ApiProperty({
        description:
            'Типы события, для которых подходит бейджик названия; пустой ' +
            'список — для всех. У бейджика комментария пуст.',
        type: [String],
        enum: BADGE_PLAN_TYPES,
        example: [EnumBadgePlanType.warm],
    })
    @IsArray()
    @IsString({ each: true })
    @IsIn(BADGE_PLAN_TYPES as unknown as string[], { each: true })
    planTypes: EnumBadgePlanType[];

    @ApiProperty({
        description:
            'Основной текст типа события (необязательно): при выборе типа ' +
            'фрейм подставит «<текст> — <клиент>» вместо одного имени ' +
            'клиента. Слово типа писать не нужно — его добавит заголовок ' +
            'задачи. Один на тип; только у названия.',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isDefault: boolean;

    @ApiProperty({
        description: 'Порядок показа: меньше — раньше.',
        type: Number,
        example: 300,
    })
    @IsInt()
    sort: number;

    @ApiProperty({
        description:
            'Выключенный бейджик во фрейм не уезжает, в наборе остаётся.',
        type: Boolean,
        example: true,
    })
    @IsBoolean()
    isActive: boolean;
}

export class PortalBadgesSaveDto {
    @ApiProperty({
        description:
            'Режим набора: «default» — общий из кода, «own» — свой набор ' +
            'ниже. В режиме «default» свой набор сохраняется, но не действует.',
        type: String,
        enum: BADGE_MODES,
        example: EnumBadgeMode.own,
    })
    @IsString()
    @IsIn(BADGE_MODES as unknown as string[])
    mode: EnumBadgeMode;

    @ApiProperty({
        description:
            'Свой набор ЦЕЛИКОМ: бейджик, которого нет в списке, из набора ' +
            'удаляется. Коды уникальны; у названия основной бейджик — один ' +
            'на тип события.',
        type: [BadgeItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeItemDto)
    items: BadgeItemDto[];

    @ApiPropertyOptional({
        description: 'Битрикс-id сотрудника, сохранившего набор.',
        type: Number,
        nullable: true,
        example: 447,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    updatedBy?: number | null;
}

export class PortalBadgesAdminDto implements PortalBadgesAdminPayload {
    @ApiProperty({
        description: 'Действующий режим набора портала.',
        type: String,
        enum: BADGE_MODES,
        example: EnumBadgeMode.default,
    })
    @IsString()
    @IsIn(BADGE_MODES as unknown as string[])
    mode: EnumBadgeMode;

    @ApiProperty({
        description:
            'Свой набор портала как сохранён (включая выключенные). Пуст, ' +
            'пока портал ничего не сохранял.',
        type: [BadgeItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeItemDto)
    items: BadgeItemDto[];

    @ApiProperty({
        description:
            'Общий набор из кода — показать рядом и предложить скопировать ' +
            'как заготовку своего.',
        type: [BadgeItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeItemDto)
    defaults: BadgeItemDto[];

    @ApiProperty({
        description: 'Счётчик сохранений портала; 0 — не сохраняли.',
        type: Number,
        example: 3,
    })
    @IsInt()
    @Min(0)
    version: number;

    @ApiPropertyOptional({
        description:
            'Когда сохраняли последний раз (ISO); null — не сохраняли.',
        type: String,
        nullable: true,
        example: '2026-10-27T12:00:00.000Z',
    })
    @IsOptional()
    @IsString()
    updatedAt: string | null;

    @ApiPropertyOptional({
        description: 'Кто сохранял последним (Битрикс-id); null — неизвестно.',
        type: Number,
        nullable: true,
        example: 447,
    })
    @IsOptional()
    @IsInt()
    updatedBy: number | null;
}

export class BadgeCatalogDto implements BadgeCatalogPayload {
    @ApiProperty({
        description: 'Версия формы ответа; фрейм сверяет её первой.',
        type: Number,
        example: BADGE_CATALOG_CONTRACT,
    })
    @IsInt()
    contract: number;

    @ApiProperty({
        description: 'Откуда действующий набор: общий или свой портала.',
        type: String,
        enum: BADGE_MODES,
        example: EnumBadgeMode.default,
    })
    @IsString()
    @IsIn(BADGE_MODES as unknown as string[])
    mode: EnumBadgeMode;

    @ApiProperty({
        description: 'Счётчик сохранений портала (человекочитаемый).',
        type: Number,
        example: 0,
    })
    @IsInt()
    version: number;

    @ApiProperty({
        description:
            'sha1 действующего набора — единственный надёжный компаратор ' +
            '«менялся ли каталог».',
        type: String,
        example: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
    })
    @IsString()
    hash: string;

    @ApiProperty({
        description: 'Действующие бейджики в порядке показа; выключенных нет.',
        type: [BadgeItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BadgeItemDto)
    items: BadgeItemDto[];
}

export class BadgeCatalogVersionDto {
    @ApiProperty({
        description: 'Счётчик сохранений — тот же, что в полном каталоге.',
        type: Number,
        example: 0,
    })
    @IsInt()
    version: number;

    @ApiProperty({
        description:
            'sha1 действующего набора — тот же, что в полном каталоге.',
        type: String,
        example: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c',
    })
    @IsString()
    hash: string;
}
