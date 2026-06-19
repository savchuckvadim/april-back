import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { portal_contracts } from 'generated/prisma';

/** Портальный договор (`portal_contracts`) с id-шниками связей. */
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
    }

    @ApiProperty({
        description: 'ID портального договора',
        example: 1,
        type: Number,
    })
    id: number;

    @ApiProperty({ description: 'ID портала', example: 1, type: Number })
    portal_id: number;

    @ApiProperty({
        description: 'ID глобального вида договора',
        example: 1,
        type: Number,
    })
    contract_id: number;

    @ApiProperty({
        description: 'ID портальной единицы измерения',
        example: 1,
        type: Number,
    })
    portal_measure_id: number;

    @ApiProperty({
        description: 'ID item-а bitrix-поля contract_type',
        example: 1,
        type: Number,
    })
    bitrixfield_item_id: number;

    @ApiProperty({
        description: 'Заголовок договора',
        example: 'Договор поставки',
        type: String,
    })
    title: string;

    @ApiPropertyOptional({
        description: 'Ссылка на шаблон',
        example: 'template',
        type: String,
    })
    template?: string | null;

    @ApiPropertyOptional({ description: 'Порядок', example: 1, type: Number })
    order?: number | null;

    @ApiPropertyOptional({
        description: 'Наименование продукта',
        example: 'Товар',
        type: String,
    })
    productName?: string | null;

    @ApiPropertyOptional({
        description: 'Описание',
        example: 'Описание договора',
        type: String,
    })
    description?: string | null;
}
