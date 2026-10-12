import { ApiPropertyOptional } from '@nestjs/swagger';
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
    SupplyTypeEnum,
} from './contract-template.enums';
import { parseMultipartList } from './create-contract-template.dto';
import { IsBooleanFlag } from './contract-template.boolean.transform';

/**
 * Частичное обновление. Отсутствие поля = «не менять», поэтому `null`
 * здесь НЕ используется как «сбросить»: для списков сброс выражается
 * пустым массивом (он нормализуется в NULL при записи).
 */
export class UpdateContractTemplateDto {
    @ApiPropertyOptional({ description: 'Новое название.' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({
        description:
            'Новый тип договора. Сбросить в «любой» нельзя: колонка NOT NULL, ' +
            'шаблона договора «по умолчанию» не существует.',
        enum: CONTRACT_LTYPE,
        enumName: 'CONTRACT_LTYPE',
    })
    @IsOptional()
    @IsEnum(CONTRACT_LTYPE)
    contract_type?: CONTRACT_LTYPE;

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

export class SetContractTemplatePortalDto {
    @ApiPropertyOptional({
        description: 'ID портала; null переводит шаблон в общие.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsNumberString()
    portal_id?: string | null;
}

export class SetContractTemplateAgentDto {
    @ApiPropertyOptional({
        description: 'ID поставщика; null снимает привязку.',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsNumberString()
    agent_id?: string | null;
}
