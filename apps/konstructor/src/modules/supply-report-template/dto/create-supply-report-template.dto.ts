import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';
import { parseMultipartList } from '@app/konstructor/modules/contract-template/dto/create-contract-template.dto';
import {
    ClientTypeEnum,
    SupplyReportTemplateScope,
    SupplyReportTemplateScopeValue,
    SupplyTypeEnum,
} from './supply-report-template.enums';
import { IsSupplyReportFieldCodeArray } from './is-supply-report-field-code.validator';
import { IsBooleanFlag } from './is-boolean-flag.decorator';
import { SUPPLY_REPORT_FIELD_CODES } from '../lib/supply-report-field-codes';

// Swagger-метаданные требуют ссылку на значение, а не на тип.
const SUPPLY_REPORT_TEMPLATE_SCOPE_FOR_META = SupplyReportTemplateScope;

/** Поля multipart (кроме файлов). */
export class CreateSupplyReportTemplateBodyDto {
    @ApiProperty({
        description: 'Название шаблона, видимое в админке.',
        example: 'Отчёт о поставке, интернет',
    })
    @IsString()
    name: string;

    @ApiPropertyOptional({
        description:
            'Уровень привязки. common — общий для всех порталов (portal_id NULL); ' +
            'portal — портальный; provider — портальный под поставщика. ' +
            'В БД не хранится, из него выводятся portal_id и agent_id.',
        enum: SUPPLY_REPORT_TEMPLATE_SCOPE_FOR_META,
        example: SupplyReportTemplateScope.PORTAL,
    })
    @IsOptional()
    @IsEnum(SUPPLY_REPORT_TEMPLATE_SCOPE_FOR_META)
    scope?: SupplyReportTemplateScopeValue;

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
        description:
            'Коды полей формы отчёта, обязательных для этого шаблона. ' +
            'Допустимые коды берутся из самой формы отчёта о поставке: ' +
            `${SUPPLY_REPORT_FIELD_CODES.join(', ')}. ` +
            'Пустой список и отсутствие поля означают «обязательность как в форме по умолчанию».',
        type: [String],
        example: ['sale_date', 'situation_comments'],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsSupplyReportFieldCodeArray()
    required_fields?: string[];

    @ApiPropertyOptional({
        description:
            'Коды полей формы отчёта, необязательных для этого шаблона. ' +
            'Тот же справочник кодов, что у required_fields.',
        type: [String],
        example: ['contract_number', 'invoice_number'],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsSupplyReportFieldCodeArray()
    optional_fields?: string[];

    @ApiPropertyOptional({
        description: 'Описание шаблона для админки.',
        example: 'Редакция от 01.10.2026',
    })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        description:
            'Шаблон по умолчанию в своей области (портал + поставщик). ' +
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

export class CreateSupplyReportTemplateMultipartDto extends CreateSupplyReportTemplateBodyDto {
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
