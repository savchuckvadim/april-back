import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsNumberString,
    IsOptional,
    IsString,
} from 'class-validator';
import { parseMultipartList } from '@app/konstructor/modules/contract-template/dto/create-contract-template.dto';
import { ClientTypeEnum, SupplyTypeEnum } from './supply-report-template.enums';
import { IsBooleanFlag } from './is-boolean-flag.decorator';
import { IsSupplyReportFieldCodeArray } from './is-supply-report-field-code.validator';

/**
 * Частичное обновление. Отсутствие поля = «не менять», поэтому `null`
 * здесь НЕ используется как «сбросить»: для списков сброс выражается
 * пустым массивом (он нормализуется в NULL при записи).
 */
export class UpdateSupplyReportTemplateDto {
    @ApiPropertyOptional({ description: 'Новое название.' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description: 'Новый портал. Пустая строка переводит шаблон в общие.',
        type: String,
    })
    @IsOptional()
    @IsString()
    portal_id?: string;

    @ApiPropertyOptional({
        description:
            'Новый поставщик. Пустая строка снимает привязку к поставщику.',
        type: String,
    })
    @IsOptional()
    @IsString()
    agent_id?: string;

    @ApiPropertyOptional({
        description: 'Типы клиента; пустой список = «для любого».',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsArray()
    @IsEnum(ClientTypeEnum, { each: true })
    client_types?: ClientTypeEnum[];

    @ApiPropertyOptional({
        description: 'Типы поставки; пустой список = «для любого».',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsArray()
    @IsEnum(SupplyTypeEnum, { each: true })
    supply_types?: SupplyTypeEnum[];

    @ApiPropertyOptional({
        description:
            'Коды обязательных полей формы отчёта; пустой список сбрасывает в NULL ' +
            '(«обязательность как в форме по умолчанию»).',
        type: [String],
        example: ['sale_date'],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsSupplyReportFieldCodeArray()
    required_fields?: string[];

    @ApiPropertyOptional({
        description:
            'Коды необязательных полей формы отчёта; пустой список сбрасывает в NULL.',
        type: [String],
        example: ['invoice_number'],
    })
    @IsOptional()
    @Transform(parseMultipartList)
    @IsSupplyReportFieldCodeArray()
    optional_fields?: string[];

    @ApiPropertyOptional({ description: 'Описание.' })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiPropertyOptional({
        description: 'Шаблон по умолчанию в своей области.',
    })
    @IsOptional()
    @IsBooleanFlag()
    is_default?: boolean;

    @ApiPropertyOptional({ description: 'Активность.' })
    @IsOptional()
    @IsBooleanFlag()
    is_active?: boolean;
}

/**
 * Тело multipart для обновления: те же поля + необязательная замена файлов.
 *
 * Нужен отдельным классом, иначе `@ApiBody({ type: UpdateSupplyReport... })`
 * не покажет файловые поля в OpenAPI и админка не сможет заменить .docx.
 */
export class UpdateSupplyReportTemplateMultipartDto extends UpdateSupplyReportTemplateDto {
    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description:
            'Новый файл шаблона (.docx). Не передан — файл не меняется.',
    })
    file?: Express.Multer.File;

    @ApiPropertyOptional({
        type: 'string',
        format: 'binary',
        description:
            'Новый демонстрационный файл (.docx). Не передан — демо не меняется.',
    })
    demo?: Express.Multer.File;
}

export class SetSupplyReportTemplatePortalDto {
    @ApiPropertyOptional({
        description: 'ID портала; null переводит шаблон в общие.',
        type: String,
        nullable: true,
        example: '7',
    })
    @IsOptional()
    @IsNumberString()
    portal_id?: string | null;
}

export class SetSupplyReportTemplateAgentDto {
    @ApiPropertyOptional({
        description: 'ID поставщика; null снимает привязку.',
        type: String,
        nullable: true,
        example: '42',
    })
    @IsOptional()
    @IsNumberString()
    agent_id?: string | null;
}

export class SupplyReportTemplateActiveDto {
    @ApiPropertyOptional({
        description: 'Активен ли шаблон. Не передан — трактуется как true.',
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    is_active?: boolean;
}

export class SupplyReportTemplateDefaultDto {
    @ApiPropertyOptional({
        description:
            'Сделать шаблоном по умолчанию в своей области. Не передан — трактуется как true.',
        example: true,
    })
    @IsOptional()
    @IsBooleanFlag()
    is_default?: boolean;
}
