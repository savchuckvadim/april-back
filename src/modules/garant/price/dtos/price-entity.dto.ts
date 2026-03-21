import { PriceEntity } from '@/modules/garant/price/entity/price.entity';
import { ApiProperty } from '@nestjs/swagger';
import { RegionType, SupplyTypeCode, SupplyType } from '../enums/price.enums';

export class PriceEntityDto {
    constructor(price: PriceEntity) {
        this.id = price.id.toString(); // Преобразуем BigInt в строку для JSON сериализации
        this.code = price.code;
        this.complect_id = price.complect_id
            ? price.complect_id.toString()
            : null;
        this.complect_code = price.complect_code;
        this.garant_package_id = price.garant_package_id
            ? price.garant_package_id.toString()
            : null;
        this.garant_package_code = price.garant_package_code;
        this.supply_id = price.supply_id ? price.supply_id.toString() : null;
        this.supply_code = price.supply_code;
        this.region_type = price.region_type as '0' | '1';
        this.supply_type = price.supply_type as 'internet' | 'proxima' | null;
        this.supply_type_code = price.supply_type_code as '0' | '1' | null;
        this.value = price.value;
        this.isSpecial = price.isSpecial;
        this.discount = price.discount;
        this.created_at = price.created_at;
        this.updated_at = price.updated_at;
    }

    @ApiProperty({
        description: 'Price ID',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Код цены',
        example: 'price-code-001',
    })
    code: string;

    @ApiProperty({
        description: 'Complect ID',
        example: '1',
        required: false,
        type: String,
    })
    complect_id: string | null;

    @ApiProperty({
        description: 'Код комплекта',
        example: 'complect-code-001',
        required: false,
    })
    complect_code: string | null;

    @ApiProperty({
        description: 'Garant Package ID',
        example: '1',
        required: false,
        type: String,
    })
    garant_package_id: string | null;

    @ApiProperty({
        description: 'Код пакета Гарант',
        example: 'package-code-001',
        required: false,
    })
    garant_package_code: string | null;

    @ApiProperty({
        description: 'Supply ID',
        example: '1',
        required: false,
        type: String,
    })
    supply_id: string | null;

    @ApiProperty({
        description: 'Код поставки',
        example: '1',
        required: false,
    })
    supply_code: string | null;

    @ApiProperty({
        description: 'Тип региона: 0 - регионы, 1 - Москва',
        example: RegionType.REGIONS,
        enum: RegionType,
        enumName: 'RegionType',
    })
    region_type: '0' | '1';

    @ApiProperty({
        description: 'Тип поставки: internet | proxima',
        example: SupplyType.INTERNET,
        required: false,
        enum: SupplyType,
        enumName: 'SupplyType',
    })
    supply_type: 'internet' | 'proxima' | null;

    @ApiProperty({
        description: 'Код типа поставки: 0 - internet, 1 - proxima',
        example: SupplyTypeCode.INTERNET,
        required: false,
        enum: SupplyTypeCode,
        enumName: 'SupplyTypeCode',
    })
    supply_type_code: '0' | '1' | null;

    @ApiProperty({
        description: 'Price value',
        example: 1000.5,
        type: Number,
    })
    value: number;

    @ApiProperty({
        description: 'Специальная цена',
        example: false,
    })
    isSpecial: boolean;

    @ApiProperty({
        description: 'Discount',
        example: 10.5,
        required: false,
        type: Number,
    })
    discount: number | null;

    @ApiProperty({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
        type: Date,
    })
    created_at: Date | null;

    @ApiProperty({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
        type: Date,
    })
    updated_at: Date | null;
}
