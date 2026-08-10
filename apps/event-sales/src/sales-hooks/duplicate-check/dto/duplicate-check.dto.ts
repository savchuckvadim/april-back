import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { DuplicateEntityType } from '@lib/portal-lib/pbx-duplicate';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';

/** Типы сущностей, из которых запускается проверка (транспортный формат). */
export const DUPLICATE_CHECK_ENTITY_TYPES = [
    'lead',
    'company',
    'deal',
    'contact',
] as const;
export type DuplicateCheckEntityType =
    (typeof DUPLICATE_CHECK_ENTITY_TYPES)[number];

/** Транспортный тип → доменный DuplicateEntityType поиска дублей. */
export const DUPLICATE_CHECK_ENTITY_MAP: Record<
    DuplicateCheckEntityType,
    DuplicateEntityType
> = {
    lead: DuplicateEntityType.LEAD,
    company: DuplicateEntityType.COMPANY,
    deal: DuplicateEntityType.DEAL,
    contact: DuplicateEntityType.CONTACT,
};

/** Глубина проверки (транспортный формат). */
export const DUPLICATE_CHECK_LEVELS = ['fast', 'deep'] as const;
export type DuplicateCheckLevel = (typeof DUPLICATE_CHECK_LEVELS)[number];

/**
 * Query-параметры вебхука робота «проверить на дубли». Параметры в query
 * (тело занято BxWebHookDto с auth портала) — как у остальных хуков.
 */
export class DuplicateCheckWebhookQueryDto {
    @ApiProperty({
        description:
            'Тип сущности, ИЗ которой запускается проверка — в её timeline ' +
            'будет записан итог.',
        example: 'lead',
        type: String,
        enum: DUPLICATE_CHECK_ENTITY_TYPES,
    })
    @IsString()
    @IsIn(DUPLICATE_CHECK_ENTITY_TYPES as unknown as string[])
    entityType: DuplicateCheckEntityType;

    @ApiProperty({
        description: 'Идентификатор сущности-источника проверки.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    entityId: number;

    @ApiPropertyOptional({
        description:
            'Глубина: fast — телефон/email/ИНН-поля; deep — плюс реквизиты ' +
            'и подстрочный поиск по названию. По умолчанию deep — хук и ' +
            'задуман как «глубокая проверка».',
        example: 'deep',
        type: String,
        enum: DUPLICATE_CHECK_LEVELS,
        default: 'deep',
    })
    @IsOptional()
    @IsString()
    @IsIn(DUPLICATE_CHECK_LEVELS as unknown as string[])
    level?: DuplicateCheckLevel;
}

/** Тело кнопки фрейма «проверить на дубли». */
export class DuplicateCheckRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description:
            'Тип сущности, ИЗ которой запускается проверка — в её timeline ' +
            'будет записан итог.',
        example: 'lead',
        type: String,
        enum: DUPLICATE_CHECK_ENTITY_TYPES,
    })
    @IsString()
    @IsIn(DUPLICATE_CHECK_ENTITY_TYPES as unknown as string[])
    entityType: DuplicateCheckEntityType;

    @ApiProperty({
        description: 'Идентификатор сущности-источника проверки.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    entityId: number;

    @ApiPropertyOptional({
        description: 'Глубина проверки. По умолчанию deep.',
        example: 'deep',
        type: String,
        enum: DUPLICATE_CHECK_LEVELS,
        default: 'deep',
    })
    @IsOptional()
    @IsString()
    @IsIn(DUPLICATE_CHECK_LEVELS as unknown as string[])
    level?: DuplicateCheckLevel;

    @ApiPropertyOptional({
        description:
            'Писать ли итог проверки комментарием в timeline сущности. ' +
            'N — только вернуть результат (например, для предпросмотра).',
        example: 'Y',
        type: String,
        enum: ['Y', 'N'],
        default: 'Y',
    })
    @IsOptional()
    @IsString()
    @IsIn(['Y', 'N'])
    writeTimeline?: 'Y' | 'N';
}

/** Элемент пачки — внутренний контракт между транспортом и use-case. */
export interface IDuplicateCheckItem {
    entityType: DuplicateCheckEntityType;
    entityId: number;
    level: DuplicateCheckLevel;
    writeTimeline: 'Y' | 'N';
}

/** Сборка элемента с дефолтами. */
export function buildDuplicateCheckItem(input: {
    entityType: DuplicateCheckEntityType;
    entityId: number;
    level?: DuplicateCheckLevel;
    writeTimeline?: 'Y' | 'N';
}): IDuplicateCheckItem {
    return {
        entityType: input.entityType,
        entityId: input.entityId,
        level: input.level ?? 'deep',
        writeTimeline: input.writeTimeline ?? 'Y',
    };
}
