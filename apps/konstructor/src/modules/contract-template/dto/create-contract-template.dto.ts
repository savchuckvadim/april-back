import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';
import {
    CONTRACT_LTYPE,
    ClientTypeEnum,
    ContractTemplateScope,
    ContractTemplateScopeValue,
    SupplyTypeEnum,
} from './contract-template.enums';
import { IsBooleanFlag } from './contract-template.boolean.transform';

// Swagger-метаданные требуют ссылку на значение, а не на тип.
const CONTRACT_TEMPLATE_SCOPE_FOR_META = ContractTemplateScope;

/**
 * Разбор списка признаков из multipart.
 *
 * multipart/form-data присылает значения СТРОКАМИ: либо JSON-массив
 * `["org","ip"]`, либо повторяющиеся поля (тогда class-transformer уже
 * отдаст массив), либо список через запятую. Без этого преобразования
 * `@IsArray()` упал бы на строке, а `whitelist: true` молча выкинул бы
 * поле — ровно тот тихий отказ, который трудно отловить.
 */
export const parseMultipartList = ({ value }: { value: unknown }): unknown => {
    if (value == null || value === '') {
        return undefined;
    }
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed: unknown = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : undefined;
        } catch {
            // Пусть падает валидация с внятным сообщением, а не JSON.parse
            return trimmed;
        }
    }
    return trimmed
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
};

/** Поля multipart (кроме файлов). */
export class CreateContractTemplateBodyDto {
    @ApiProperty({
        description: 'Название шаблона, видимое в админке.',
        example: 'Договор услуг (интернет), бюджетники',
    })
    @IsString()
    name: string;

    @ApiProperty({
        description:
            'Тип договора. ОБЯЗАТЕЛЕН: шаблона договора «по умолчанию» не существует, ' +
            'рендер лицензионной сделки в абонентский шаблон даёт юридически неверный документ.',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
        example: CONTRACT_LTYPE.LIC,
    })
    @IsEnum(CONTRACT_LTYPE)
    contract_type: CONTRACT_LTYPE;

    @ApiPropertyOptional({
        description:
            'Уровень привязки. common — общий для всех порталов (portal_id NULL); ' +
            'portal — портальный; provider — портальный под поставщика. ' +
            'В БД не хранится, из него выводятся portal_id и agent_id.',
        enum: CONTRACT_TEMPLATE_SCOPE_FOR_META,
        example: ContractTemplateScope.PORTAL,
    })
    @IsOptional()
    @IsEnum(CONTRACT_TEMPLATE_SCOPE_FOR_META)
    scope?: ContractTemplateScopeValue;

    @ApiPropertyOptional({
        description: 'ID портала. Обязателен для scope=portal|provider.',
        type: String,
        example: '7',
    })
    @IsOptional()
    @IsNumberString()
    portal_id?: string;

    @ApiPropertyOptional({
        description:
            'ID поставщика (agents.id). Обязателен для scope=provider. ' +
            'NULL — шаблон годится любому поставщику.',
        type: String,
        example: '42',
    })
    @IsOptional()
    @IsNumberString()
    agent_id?: string;

    @ApiPropertyOptional({
        description:
            'Типы клиента, для которых годится шаблон. Пустой список и отсутствие ' +
            'поля означают «для любого типа клиента».',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
        example: [ClientTypeEnum.ORG_STATE],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsArray()
    @IsEnum(ClientTypeEnum, { each: true })
    client_types?: ClientTypeEnum[];

    @ApiPropertyOptional({
        description:
            'Типы поставки, для которых годится шаблон. Пустой список и отсутствие ' +
            'поля означают «для любого типа поставки».',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
        example: [SupplyTypeEnum.INTERNET],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsArray()
    @IsEnum(SupplyTypeEnum, { each: true })
    supply_types?: SupplyTypeEnum[];

    @ApiPropertyOptional({
        description: 'Описание шаблона для админки.',
        example: 'Редакция от 01.10.2026, согласована юристом',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        description:
            'Шаблон по умолчанию в своей области (портал + поставщик + тип договора). ' +
            'При установке снимает флаг у остальных шаблонов этой же области.',
        example: false,
    })
    @IsOptional()
    @IsBooleanFlag()
    is_default?: boolean;

    @ApiPropertyOptional({
        description: 'Активен ли шаблон. Неактивные не участвуют в подборе.',
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    is_active?: boolean;

    @ApiPropertyOptional({
        description: 'ID пользователя Битрикс, создавшего шаблон.',
        type: String,
        example: '1',
    })
    @IsOptional()
    @IsNumberString()
    creator_bitrix_user_id?: string;
}

export class CreateContractTemplateMultipartDto extends CreateContractTemplateBodyDto {
    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'Файл шаблона (.docx) для docxtemplater.',
    })
    file: Express.Multer.File;

    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description:
            'Необязательный демонстрационный файл (заполненный пример).',
    })
    demo?: Express.Multer.File;
}
