import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';
import {
    DUPLICATE_CHECK_ENTITY_TYPES,
    DuplicateCheckEntityType,
} from './duplicate-check.dto';

/** Краткая карточка кандидата-дубля для фронта. */
export class DuplicateCheckCandidateDto {
    @ApiProperty({
        description: 'Тип найденной сущности.',
        example: 'company',
        type: String,
        enum: DUPLICATE_CHECK_ENTITY_TYPES,
    })
    @IsString()
    entityType: DuplicateCheckEntityType;

    @ApiProperty({
        description: 'Идентификатор сущности-кандидата.',
        example: 431,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    id: number;

    @ApiPropertyOptional({
        description: 'Название/ФИО кандидата.',
        example: 'ООО Ромашка',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    title: string | null;

    @ApiProperty({
        description: 'Скоринг совпадения (0–100).',
        example: 95,
        type: Number,
    })
    @IsInt()
    score: number;

    @ApiProperty({
        description: 'Ссылка на карточку сущности на портале.',
        example: 'https://example.bitrix24.ru/crm/company/details/431/',
        type: String,
    })
    @IsString()
    url: string;
}

/** Итог проверки одной сущности-источника. */
export class DuplicateCheckItemResultDto {
    @ApiProperty({
        description: 'Тип сущности-источника проверки.',
        example: 'lead',
        type: String,
        enum: DUPLICATE_CHECK_ENTITY_TYPES,
    })
    @IsString()
    entityType: DuplicateCheckEntityType;

    @ApiProperty({
        description: 'Идентификатор сущности-источника.',
        example: 42,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    entityId: number;

    @ApiProperty({
        description: 'Сколько кандидатов-дублей найдено.',
        example: 2,
        type: Number,
    })
    @IsInt()
    candidatesFound: number;

    @ApiProperty({
        description: 'Кандидаты (по убыванию скоринга).',
        type: [DuplicateCheckCandidateDto],
    })
    @IsArray()
    candidates: DuplicateCheckCandidateDto[];

    @ApiProperty({
        description: 'Итог записан комментарием в timeline сущности.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    timelineWritten: boolean;

    @ApiProperty({
        description:
            'Проставлены ли маркеры лида op_lead_is_duplicate_check / ' +
            'op_lead_is_duplicate (только для entityType=lead и только ' +
            'если поля установлены на портале).',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    leadFlagsWritten: boolean;

    @ApiProperty({
        description: 'Предупреждения graceful degradation.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Результат операции «проверка дублей». */
export class DuplicateCheckResultDto {
    @ApiProperty({
        description: 'Доменная логика выполнена (не заглушка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description: 'Итоги по каждой сущности пачки.',
        type: [DuplicateCheckItemResultDto],
    })
    @IsArray()
    items: DuplicateCheckItemResultDto[];

    @ApiProperty({
        description: 'Краткое пояснение итога операции.',
        example: 'Проверено сущностей: 1, найдено дублей: 2.',
        type: String,
    })
    @IsString()
    message: string;
}

/** Операция «проверка дублей» с типизированным результатом. */
export class DuplicateCheckOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: DuplicateCheckResultDto,
        nullable: true,
    })
    declare result: DuplicateCheckResultDto | null;
}
