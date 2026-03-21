import { InfoblockEntity } from '@/modules/garant/infoblock/infoblock.entity';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Light версия инфоблока без вложенных связей (для списков)
 */
export class GetInfoblockLightResponseDto {
    constructor(infoblock: InfoblockEntity) {
        this.id = infoblock.id;
        this.number = infoblock.number;
        this.name = infoblock.name;
        this.title = infoblock.title;
        this.description = infoblock.description;
        this.descriptionForSale = infoblock.descriptionForSale;
        this.shortDescription = infoblock.shortDescription;
        this.weight = infoblock.weight;
        this.code = infoblock.code;
        this.inGroupId = infoblock.inGroupId;
        this.group_id = infoblock.group_id;
        this.isLa = infoblock.isLa;
        this.isFree = infoblock.isFree;
        this.isShowing = infoblock.isShowing;
        this.isSet = infoblock.isSet;
        this.isProduct = infoblock.isProduct;
        this.isPackage = infoblock.isPackage;
        this.tag = infoblock.tag;
        this.parent_id = infoblock.parent_id;
        this.relation_id = infoblock.relation_id;
        this.related_id = infoblock.related_id;
        this.excluded_id = infoblock.excluded_id;
        this.created_at = infoblock.created_at;
        this.updated_at = infoblock.updated_at;
    }

    @ApiProperty({
        description: 'Infoblock ID',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Infoblock number',
        example: 1,
        type: Number,
    })
    number: number;

    @ApiProperty({
        description: 'Infoblock name',
        example: 'Infoblock Name',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Infoblock title',
        example: 'Infoblock Title',
        type: String,
        required: false,
        nullable: true,
    })
    title: string | null;

    @ApiProperty({
        description: 'Infoblock description',
        example: 'Description',
        type: String,
        required: false,
        nullable: true,
    })
    description: string | null;

    @ApiProperty({
        description: 'Infoblock description for sale',
        example: 'Description for sale',
        type: String,
        required: false,
        nullable: true,
    })
    descriptionForSale: string | null;

    @ApiProperty({
        description: 'Infoblock short description',
        example: 'Short description',
        type: String,
        required: false,
        nullable: true,
    })
    shortDescription: string | null;

    @ApiProperty({
        description: 'Infoblock weight',
        example: '1.5',
        type: String,
    })
    weight: string;

    @ApiProperty({
        description: 'Infoblock code',
        example: 'code',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'In group ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    inGroupId: string | null;

    @ApiProperty({
        description: 'Group ID',
        example: '1',
        type: String,
        required: false,
    })
    group_id: string | null;

    @ApiProperty({
        description: 'Is LA',
        example: false,
        type: Boolean,
    })
    isLa: boolean;

    @ApiProperty({
        description: 'Is free',
        example: false,
        type: Boolean,
    })
    isFree: boolean;

    @ApiProperty({
        description: 'Is showing',
        example: true,
        type: Boolean,
    })
    isShowing: boolean;

    @ApiProperty({
        description: 'Is set',
        example: false,
        type: Boolean,
    })
    isSet: boolean;

    @ApiProperty({
        description: 'Is product',
        example: false,
        type: Boolean,
        required: false,
        nullable: true,
    })
    isProduct: boolean | null;

    @ApiProperty({
        description: 'Is package',
        example: false,
        type: Boolean,
        required: false,
        nullable: true,
    })
    isPackage: boolean | null;

    @ApiProperty({
        description: 'Tag',
        example: 'tag',
        type: String,
        required: false,
        nullable: true,
    })
    tag: string | null;

    @ApiProperty({
        description: 'Parent ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    parent_id: string | null;

    @ApiProperty({
        description: 'Relation ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    relation_id: string | null;

    @ApiProperty({
        description: 'Related ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    related_id: string | null;

    @ApiProperty({
        description: 'Excluded ID',
        example: '1',
        type: String,
        required: false,
        nullable: true,
    })
    excluded_id: string | null;

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
}
