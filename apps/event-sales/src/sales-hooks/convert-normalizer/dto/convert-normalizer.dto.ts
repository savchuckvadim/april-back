import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookRunRequestBaseDto } from '../../core/dto/sales-hook-run-request.dto';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Query вебхука робота на создание сделки (onCrmDealAdd). */
export class ConvertNormalizerWebhookQueryDto {
    @ApiProperty({
        description: 'Идентификатор созданной сделки Bitrix.',
        example: 1024,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;
}

/** Тело ручного запуска нормализатора (отладка/догон). */
export class ConvertNormalizerRunDto extends SalesHookRunRequestBaseDto {
    @ApiProperty({
        description: 'Идентификатор сделки Bitrix для нормализации.',
        example: 1024,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;
}

/** Элемент пачки — внутренний контракт. */
export interface IConvertNormalizerItem {
    dealId: number;
}

/** Итог нормализации одной сделки. */
export class ConvertNormalizerItemResultDto {
    @ApiProperty({
        description: 'Идентификатор проверенной сделки.',
        example: 1024,
        type: Number,
    })
    @IsInt()
    dealId: number;

    @ApiProperty({
        description:
            'Граф был неполон и дописан (LEAD_ID есть, наши поля были пусты).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    healed: boolean;

    @ApiPropertyOptional({
        description: 'Лид-первоисточник, вписанный в граф.',
        example: 42,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    leadId: number | null;

    @ApiProperty({
        description:
            'Предупреждения: у лида уже была ДРУГАЯ наша сделка (дубль от ' +
            'конвертации — кандидат на merge) и т.п.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Результат операции нормализатора. */
export class ConvertNormalizerResultDto {
    @ApiProperty({
        description: 'Доменная логика выполнена (не заглушка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description: 'Итоги по каждой сделке пачки.',
        type: [ConvertNormalizerItemResultDto],
    })
    @IsArray()
    items: ConvertNormalizerItemResultDto[];

    @ApiProperty({
        description: 'Краткое пояснение итога.',
        example: 'Проверено сделок: 1, дописан граф: 1.',
        type: String,
    })
    @IsString()
    message: string;
}

/** Операция нормализатора с типизированным результатом. */
export class ConvertNormalizerOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: ConvertNormalizerResultDto,
        nullable: true,
    })
    declare result: ConvertNormalizerResultDto | null;
}
