import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString } from 'class-validator';

/**
 * ВАЖНО: id у `contract_templates` — BIGINT autoincrement
 * (`$table->id()` в миграции 2026_09_15_100100), а НЕ CHAR(36)-uuid,
 * как у `invoice_templates`. Поэтому здесь `@IsNumberString()`, а не
 * `@IsUUID('4')` — слепое копирование DTO счёта дало бы 400 на любом id.
 *
 * Наружу id уходит СТРОКОЙ: BigInt не сериализуется в JSON (глобальный
 * ResponseInterceptor кинет исключение), и значения выше 2^53 не влезают
 * в number.
 */
export class ContractTemplateIdParamsDto {
    @ApiProperty({
        description: 'ID шаблона договора (BIGINT, передаётся строкой).',
        type: String,
        example: '42',
    })
    @IsNumberString()
    id: string;
}

export class ContractTemplatePortalParamsDto {
    @ApiProperty({
        description: 'ID портала (BIGINT, передаётся строкой).',
        type: String,
        example: '7',
    })
    @IsNumberString()
    portal_id: string;
}
