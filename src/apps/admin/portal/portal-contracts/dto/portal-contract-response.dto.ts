import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { portal_contracts } from 'generated/prisma';

export class PortalContractResponseDto {
    constructor(portalContract: portal_contracts) {
        this.id = Number(portalContract.id);
        this.portal_id = Number(portalContract.portal_id);
        this.contract_id = Number(portalContract.contract_id);
        this.portal_measure_id = Number(portalContract.portal_measure_id);
        this.bitrixfield_item_id = Number(portalContract.bitrixfield_item_id);
        this.title = portalContract.title;

        this.template = portalContract.template;
        this.order = portalContract.order;
        this.productName = portalContract.productName;
        this.description = portalContract.description;
        this.created_at = portalContract.created_at;
        this.updated_at = portalContract.updated_at;
    }


    @ApiProperty({
        description: 'Portal Contract ID',
        example: 1,
    })
    id: number;

    @ApiProperty({
        description: 'Portal ID',
        example: 1,
    })
    portal_id: number;

    @ApiProperty({
        description: 'Contract ID',
        example: 1,
    })
    contract_id: number;

    @ApiProperty({
        description: 'Portal Measure ID',
        example: 1,
    })
    portal_measure_id: number;

    @ApiProperty({
        description: 'Bitrix Field Item ID',
        example: 1,
    })
    bitrixfield_item_id: number;

    @ApiProperty({
        description: 'Title',
        example: 'Portal Contract Title',
    })
    title: string;

    @ApiPropertyOptional({
        description: 'Template',
        example: 'template',
    })
    template?: string | null;

    @ApiPropertyOptional({
        description: 'Order',
        example: 1,
    })
    order?: number | null;

    @ApiPropertyOptional({
        description: 'Product name',
        example: 'Product Name',
    })
    productName?: string | null;

    @ApiPropertyOptional({
        description: 'Description',
        example: 'Description text',
    })
    description?: string | null;

    @ApiPropertyOptional({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
    })
    updated_at?: Date | null;
}

