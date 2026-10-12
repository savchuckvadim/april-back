import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { CONTRACT_LTYPE } from '@app/konstructor/document-generate/type/contract.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';

/**
 * Признаки отбора шаблона в виде query-параметров.
 *
 * Это ТОТ ЖЕ набор, что `DocumentTemplateService.buildCriteria` получает из
 * DTO генерации, только плоским GET-ом: эндпоинт отвечает на вопрос «какой
 * шаблон поедет в документ и почему», не генерируя документ.
 *
 * ВАЖНО про валидаторы: при `whitelist: true` поле без class-validator
 * декоратора молча вырезается из запроса, а поле без `@ApiProperty` не
 * попадает в OpenAPI — и клиент админки (orval) о нём не узнаёт. Поэтому
 * каждое поле имеет и то, и другое.
 */
export class ResolveTemplateQueryDto {
    @ApiProperty({
        description:
            'Домен портала — из него выводится portal_id. ' +
            'Если портал по домену не найден, поиск идёт только среди общих шаблонов (portal_id IS NULL), без ошибки.',
        example: 'gsr.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Поставщик (agents.id). Не передан или <= 0 — ищутся только шаблоны без привязки к поставщику; ' +
            'шаблон произвольного поставщика НИКОГДА не берётся, иначе в документ уедут реквизиты не того юрлица.',
        type: Number,
        example: 42,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    providerId?: number;

    @ApiPropertyOptional({
        description:
            'Тип клиента. Не передан — подходят только шаблоны «для любого типа клиента» (client_types IS NULL).',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        example: ClientTypeEnum.ORG,
    })
    @IsOptional()
    @IsEnum(ClientTypeEnum)
    clientType?: ClientTypeEnum;

    @ApiPropertyOptional({
        description:
            'Тип поставки. Не передан — подходят только шаблоны «для любого типа поставки» (supply_types IS NULL).',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        example: SupplyTypeEnum.INTERNET,
    })
    @IsOptional()
    @IsEnum(SupplyTypeEnum)
    supplyType?: SupplyTypeEnum;
}

/**
 * То же плюс обязательный тип договора.
 *
 * Тип договора — ЖЁСТКОЕ равенство, оно не ранжируется и не ослабляется:
 * шаблона договора «на любой тип» не существует. Поле объявлено
 * обязательным, чтобы 400 приходил из валидации с внятным текстом, а не из
 * сервиса. Проверка в сервисе всё равно остаётся — она защищает путь
 * генерации, который сюда не ходит.
 */
export class ResolveContractTemplateQueryDto extends ResolveTemplateQueryDto {
    @ApiProperty({
        description:
            'Тип договора (CONTRACT_LTYPE). Обязателен: шаблона договора «по умолчанию на любой тип» не существует, ' +
            'и отрендерить лицензионную сделку в абонентский шаблон хуже, чем не отдать документ.',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
        example: CONTRACT_LTYPE.ABON,
    })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;
}

/** Параметр диагностики: портал, по которому смотрим конфликты. */
export class TemplateDiagnosticsQueryDto {
    @ApiPropertyOptional({
        description:
            'ID портала. Не передан — проверяется справочник целиком, по всем порталам. ' +
            'Передан — проверяются строки этого портала ВМЕСТЕ с общими (portal_id IS NULL), ' +
            'потому что общий конфликт достаётся и этому порталу тоже.',
        type: Number,
        example: 7,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    portalId?: number;
}
