import {
    InfogroupEntity,
    InfogroupProductType,
    InfogroupType,
} from '@/modules/garant/infogroup/entity/infogroup.entity';
import { ApiProperty } from '@nestjs/swagger';
import { InfoblockEntityLightDto } from '../../infoblock';

/**
 * Полная версия DTO для группы инфоблоков (используется в complect и info-group модулях)
 * Поле infoblocks опционально - заполняется только при необходимости
 */
export class InfogroupEntityDto {
    constructor(infogroup: InfogroupEntity) {
        this.id = infogroup.id;
        this.number = infogroup.number;
        this.code = infogroup.code;
        this.name = infogroup.name;
        this.title = infogroup.title;
        this.description = infogroup.description;
        this.descriptionForSale = infogroup.descriptionForSale;
        this.shortDescription = infogroup.shortDescription;
        this.type = infogroup.type;
        this.productType = infogroup.productType;
        this.created_at = infogroup.created_at;
        this.updated_at = infogroup.updated_at;
        this.infoblocks = infogroup.infoblocks
            ? infogroup.infoblocks.map(
                  infoblock => new InfoblockEntityLightDto(infoblock),
              )
            : undefined;
    }

    @ApiProperty({
        description: 'Infogroup ID',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Infogroup number',
        example: 0,
        type: Number,
    })
    number: number;

    @ApiProperty({
        description: 'Infogroup code',
        example: 'npa',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Infogroup name',
        example: 'Нормативно-правовые акты',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Infogroup title',
        example: 'Нормативно-правовые акты',
        type: String,
    })
    title: string;

    @ApiProperty({
        description: 'Infogroup description',
        example: 'Описание группы',
        type: String,
        required: false,
        nullable: true,
    })
    description: string | null;

    @ApiProperty({
        description: 'Infogroup description for sale',
        example: 'Описание для продажи',
        type: String,
        required: false,
        nullable: true,
    })
    descriptionForSale: string | null;

    @ApiProperty({
        description: 'Infogroup short description',
        example: 'Краткое описание',
        type: String,
        required: false,
        nullable: true,
    })
    shortDescription: string | null;

    @ApiProperty({
        description: 'Infogroup type',
        example: InfogroupType.INFOBLOCKS,
        enum: InfogroupType,
    })
    type: InfogroupType;

    @ApiProperty({
        description: 'Infogroup product type',
        example: InfogroupProductType.GARANT,
        enum: InfogroupProductType,
    })
    productType: InfogroupProductType;

    @ApiProperty({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
        required: false,
        nullable: true,
    })
    created_at: Date | null;

    @ApiProperty({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
        type: Date,
        required: false,
        nullable: true,
    })
    updated_at: Date | null;

    @ApiProperty({
        description: 'Infoblocks in group',
        type: () => InfoblockEntityLightDto,
        isArray: true,
        required: false,
    })
    infoblocks?: InfoblockEntityLightDto[];
}
