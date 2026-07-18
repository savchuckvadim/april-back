import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MarketplaceProduct } from '../config/marketplace-manifest';

/**
 * DTO активации продукта и повторного запуска provisioning
 * (admin-ручки под X-Admin-Key; их дергает apps/admin при approve заявки).
 */

export class ActivateProductDto {
    @ApiPropertyOptional({
        description:
            'member_id портала (приоритетный идентификатор; постоянный)',
        type: String,
        example: '30aedf93f9c0e53a21143710eba8d95f',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    memberId?: string;

    @ApiPropertyOptional({
        description: 'Домен портала (фолбэк, если member_id неизвестен)',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;

    @ApiProperty({
        description: 'Код активируемого продукта',
        enum: MarketplaceProduct,
        example: MarketplaceProduct.SALES,
    })
    @IsEnum(MarketplaceProduct)
    productCode!: MarketplaceProduct;

    @ApiPropertyOptional({
        description:
            'Кто одобрил (login супер-пользователя; пишется в portals.approved_by)',
        type: String,
        example: 'admin',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    approvedBy?: string;
}

export class ActivationResultDto {
    @ApiProperty({
        description: 'ID портала (portals.id)',
        type: String,
        example: '7',
    })
    portalId!: string;

    @ApiProperty({
        description: 'Код продукта',
        enum: MarketplaceProduct,
        example: MarketplaceProduct.SALES,
    })
    productCode!: MarketplaceProduct;

    @ApiProperty({
        description: 'Статус допуска портала после операции',
        type: String,
        example: 'approved',
    })
    approvalStatus!: string;

    @ApiProperty({
        description: 'Статус продукта на портале (portal_products.status)',
        type: String,
        example: 'active',
    })
    productStatus!: string;

    @ApiProperty({
        description:
            'Поставлена ли фоновая задача provisioning pbx-сущностей в очередь',
        type: Boolean,
        example: true,
    })
    provisionDispatched!: boolean;

    @ApiPropertyOptional({
        description: 'ID задачи в очереди (Bull jobId) — для диагностики',
        type: String,
        example: 'mp-provision:30aedf93f9c0e53a21143710eba8d95f:sales',
    })
    provisionJobId?: string;
}
