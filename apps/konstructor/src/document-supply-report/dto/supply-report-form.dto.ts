import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { ClientTypeEnum } from '../../document-generate/type/client.type';
import { SupplyTypeEnum } from '../../document-generate/type/bx-rq.type';
import { CONTRACT_LTYPE } from '../../document-generate/type/contract.type';
import { SupplyReportDto } from '../../supply/init-supply/dto/supply-fields/supply-fields.dto';

/**
 * Запрос состава формы отчёта о поставке: ровно то, что нужно подбору
 * портальной настройки (`supply_report_templates`). Легаси init-form требовал
 * весь слепок конструктора — новому фронту он не нужен.
 */
export class SupplyReportFormRequestDto {
    @ApiProperty({ description: 'Домен портала' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'Поставщик документов', type: Number, required: false })
    @IsOptional()
    @IsNumber()
    providerId?: number;

    @ApiProperty({ description: 'Тип договора', enum: CONTRACT_LTYPE, enumName: 'CONTRACT_LTYPE' })
    @IsEnum(CONTRACT_LTYPE)
    contractType: CONTRACT_LTYPE;

    @ApiProperty({ description: 'Тип клиента', enum: ClientTypeEnum, enumName: 'ClientType' })
    @IsEnum(ClientTypeEnum)
    clientType: ClientTypeEnum;

    @ApiProperty({ description: 'Вид поставки', enum: SupplyTypeEnum, enumName: 'SupplyType' })
    @IsEnum(SupplyTypeEnum)
    supplyType: SupplyTypeEnum;
}

export class SupplyReportFormResponseDto {
    @ApiProperty({
        description: '15 полей формы отчёта о поставке с портальной настройкой обязательности',
        type: [SupplyReportDto],
    })
    supply: SupplyReportDto[];
}
