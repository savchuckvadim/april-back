import {
    IsOptional,
    IsEnum,
    IsBoolean,
    IsString,
    IsNumberString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import { OfferTemplateVisibility } from '../../offer-template/dtos/create-offer-template.dto';

export class WordTemplateQueryDto {
    @ApiProperty({ required: false, enum: OfferTemplateVisibility })
    @IsEnum(OfferTemplateVisibility)
    @IsOptional()
    visibility?: OfferTemplateVisibility;

    @ApiProperty({ required: false })
    @IsNumberString()
    @IsOptional()
    portal_id?: string;

    @ApiProperty({ required: false })
    @IsBoolean()
    @IsOptional()
    is_active?: boolean;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    search?: string;

    @ApiPropertyOptional({
        description: 'Фильтр по агенту (поставщику).',
        example: '12',
    })
    @IsNumberString()
    @IsOptional()
    agent_id?: string;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу клиента. Совпадение считается в TypeScript: ' +
            'список лежит JSON-ом в LongText, у Prisma нет операций по ' +
            'массивам в строковой колонке, а сырой SQL в проекте запрещён. ' +
            'Шаблоны с NULL («для любого») в выборку попадают.',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
    })
    @IsEnum(ClientTypeEnum)
    @IsOptional()
    client_type?: ClientTypeEnum;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу поставки. Считается так же, в TypeScript; ' +
            'шаблоны с NULL («для любого») в выборку попадают.',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
    })
    @IsEnum(SupplyTypeEnum)
    @IsOptional()
    supply_type?: SupplyTypeEnum;
}
