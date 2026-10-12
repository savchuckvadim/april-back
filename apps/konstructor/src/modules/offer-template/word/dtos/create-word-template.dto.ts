import {
    IsArray,
    IsString,
    IsOptional,
    IsBoolean,
    IsEnum,
    IsNumber,
    IsNumberString,
    MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import { parseMultipartList } from '@app/konstructor/modules/contract-template/dto/create-contract-template.dto';
import { OfferTemplateVisibility } from '../../offer-template/dtos/create-offer-template.dto';
import { WordTemplate } from '../entities';

export class CreateWordTemplateBodyDto {
    @ApiProperty({ description: 'The name of the word template' })
    @IsString()
    @MaxLength(255, { message: 'name must be at most 255 characters' })
    name: string;

    @ApiProperty({
        description: 'The visibility of the word template',
        enum: OfferTemplateVisibility,
        enumName: 'OfferTemplateVisibility',
    })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility?: OfferTemplateVisibility = OfferTemplateVisibility.USER;

    @ApiProperty({ description: 'Whether the word template is default' })
    @IsBoolean()
    @IsOptional()
    is_default?: boolean = false;

    @ApiProperty({ description: 'The tags of the word template' })
    @IsString()
    @IsOptional()
    @MaxLength(255, { message: 'tags must be at most 255 characters' })
    tags?: string;

    @ApiProperty({ description: 'Whether the word template is active' })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean = false;

    @ApiProperty({
        description: 'id of the portal',
        required: true,
        type: Number,
    })
    @IsNumber()
    portal_id: number;

    @ApiProperty({
        description: 'id of the user',
        required: true,
        type: Number,
    })
    @IsNumber()
    user_id: number;

    @ApiPropertyOptional({
        description:
            'ID агента (поставщика), под которого годится шаблон. ' +
            'Отсутствие поля означает «для любого поставщика» (в БД NULL). ' +
            'Автоподбор по этому полю НЕ выполняется: у шаблонов КП своя ' +
            'логика выбора, поле хранится и редактируется как есть.',
        example: '12',
    })
    @IsOptional()
    @IsNumberString()
    agent_id?: string;

    @ApiPropertyOptional({
        description:
            'Типы клиента, для которых годится шаблон. Пустой список и ' +
            'отсутствие поля означают «для любого типа клиента» (в БД NULL).',
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
            'Типы поставки, для которых годится шаблон. Пустой список и ' +
            'отсутствие поля означают «для любого типа поставки» (в БД NULL).',
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
}

export class CreateWordTemplateMultipartDto extends CreateWordTemplateBodyDto {
    @ApiProperty({
        type: 'string',
        format: 'binary',
        description: 'DOCX template file',
    })
    file: any;
}

export class CreateWordTemplateServerDto extends CreateWordTemplateBodyDto {
    @ApiProperty({ description: 'The code of the word template' })
    @IsString()
    code: string;
}

export class CreateWordTemplateResponseDto {
    constructor(partial: Partial<WordTemplate>) {
        Object.assign(this, partial);
    }
    @ApiProperty({ type: String })
    id: string;

    @ApiProperty({ type: String })
    name: string;

    @ApiProperty({ enum: OfferTemplateVisibility })
    visibility: OfferTemplateVisibility;

    @ApiProperty({ type: Boolean })
    is_default: boolean;

    @ApiProperty({ type: String })
    file_path: string;

    @ApiProperty({ required: false })
    demo_path?: string;

    @ApiProperty({ type: String })
    type: string;

    @ApiProperty()
    code: string;

    @ApiProperty({ required: false })
    tags?: string;

    @ApiProperty({ type: Boolean })
    is_active: boolean;

    @ApiProperty({ type: Number })
    counter: number;

    @ApiProperty({ required: false, type: String })
    template_url?: string;

    @ApiProperty({ required: false, type: Date })
    created_at?: Date;

    @ApiProperty({ required: false, type: Date })
    updated_at?: Date;

    @ApiProperty({ required: false, type: Boolean })
    is_archived?: boolean;

    @ApiProperty({ required: false, type: Date })
    archived_at?: Date;

    @ApiProperty({ required: false, type: Number })
    portal_id?: number;

    @ApiProperty({ required: false, type: Number })
    user_id?: number;

    @ApiProperty({
        description: 'ID агента (поставщика); null — «для любого».',
        required: false,
        type: String,
        nullable: true,
    })
    agent_id?: string | null;

    @ApiProperty({
        description:
            'Типы клиента; null — «для любого». Разобрано из JSON-колонки.',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
        isArray: true,
        required: false,
        nullable: true,
    })
    client_types?: ClientTypeEnum[] | null;

    @ApiProperty({
        description:
            'Типы поставки; null — «для любого». Разобрано из JSON-колонки.',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
        isArray: true,
        required: false,
        nullable: true,
    })
    supply_types?: SupplyTypeEnum[] | null;
}
