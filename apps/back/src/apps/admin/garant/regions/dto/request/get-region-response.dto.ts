import { RegionEntity } from '@/modules/garant';
import { ApiProperty } from '@nestjs/swagger';

export class GetRegionResponseDto extends RegionEntity {
    constructor(region: RegionEntity) {
        super();
        this.id = region.id;
        this.number = region.number;
        this.title = region.title;
        this.code = region.code;
        this.infoblock = region.infoblock;
        this.abs = region.abs;
        this.tax = region.tax;
        this.tax_abs = region.tax_abs;
        this.created_at = region.created_at;
        this.updated_at = region.updated_at;
    }

    @ApiProperty({
        description: 'Region ID',
        example: 1,
    })
    declare id: string;

    @ApiProperty({
        description: 'Region name',
        example: 'Region Name',
    })
    declare number: number;

    @ApiProperty({
        description: 'Region title',
        example: 'Region Title',
    })
    declare title: string;

    @ApiProperty({
        description: 'Region code',
        example: 'Region Code',
    })
    declare code: string;

    @ApiProperty({
        description: 'Region infoblock',
        example: 'Region Infoblock',
    })
    declare infoblock: string;

    @ApiProperty({
        description: 'Region abs',
        example: 'Region Abs',
    })
    declare abs: number;

    @ApiProperty({
        description: 'Region tax',
        example: 'Region Tax',
    })
    declare tax: number;

    @ApiProperty({
        description: 'Region tax abs',
        example: 'Region Tax Abs',
    })
    declare tax_abs: number;

    @ApiProperty({
        description: 'Region created at',
        example: '2024-01-01T00:00:00.000Z',
    })
    declare created_at: Date | undefined;

    @ApiProperty({
        description: 'Region updated at',
        example: '2024-01-01T00:00:00.000Z',
    })
    declare updated_at: Date | undefined;
}
