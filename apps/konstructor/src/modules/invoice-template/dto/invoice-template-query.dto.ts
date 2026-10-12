import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanFlag } from '@lib/portal-lib/konstructor/document-template';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ClientTypeEnum } from '@app/konstructor/document-generate/type/client.type';
import { SupplyTypeEnum } from '@app/konstructor/document-generate/type/supply.type';
import {
    InvoiceTemplateVisibility as InvoiceTemplateVisibilitySchema,
    InvoiceTemplateVisibilityValue,
} from './invoice-template.enums';

const _invoiceTemplateVisibilityForMeta = InvoiceTemplateVisibilitySchema;

export class InvoiceTemplateQueryDto {
    @ApiPropertyOptional({ enum: _invoiceTemplateVisibilityForMeta })
    @IsOptional()
    @IsEnum(_invoiceTemplateVisibilityForMeta)
    visibility?: InvoiceTemplateVisibilityValue;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumberString()
    portal_id?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumberString()
    agent_id?: string;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу клиента. Совпадение считается в TypeScript: список ' +
            'лежит JSON-ом в LongText, у Prisma нет операций по массивам в строковой ' +
            'колонке, а сырой SQL в проекте запрещён. Шаблоны с NULL («для любого») ' +
            'в выборку попадают.',
        enum: ClientTypeEnum,
        enumName: 'ClientTypeEnum',
    })
    @IsOptional()
    @IsEnum(ClientTypeEnum)
    client_type?: ClientTypeEnum;

    @ApiPropertyOptional({
        description:
            'Фильтр по типу поставки. Считается так же, в TypeScript; ' +
            'шаблоны с NULL («для любого») в выборку попадают.',
        enum: SupplyTypeEnum,
        enumName: 'SupplyTypeEnum',
    })
    @IsOptional()
    @IsEnum(SupplyTypeEnum)
    supply_type?: SupplyTypeEnum;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBooleanFlag()
    is_active?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsBooleanFlag()
    is_archived?: boolean;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;
}
