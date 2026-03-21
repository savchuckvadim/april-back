import { InfoblockEntity } from '@/modules/garant/infoblock/';
import { ApiProperty } from '@nestjs/swagger';
import { InfogroupResponseDto } from '../../info-group/dto/infogroup-response.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Полная версия DTO для инфоблока со всеми связями (используется в complect и infoblock модулях)
 */
export class InfoblockResponseDto {
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

        // Вложенные структуры
        this.group = infoblock.group
            ? new InfogroupResponseDto(infoblock.group)
            : undefined;
        this.parent = infoblock.parent
            ? new InfoblockResponseDto(infoblock.parent)
            : undefined;
        this.relation = infoblock.relation
            ? new InfoblockResponseDto(infoblock.relation)
            : undefined;
        this.related = infoblock.related
            ? new InfoblockResponseDto(infoblock.related)
            : undefined;
        this.excluded = infoblock.excluded
            ? new InfoblockResponseDto(infoblock.excluded)
            : undefined;
        this.packages = infoblock.packages
            ? infoblock.packages.map(pkg => new InfoblockResponseDto(pkg))
            : undefined;
        this.packageInfoblocks = infoblock.packageInfoblocks
            ? infoblock.packageInfoblocks.map(
                  pkg => new InfoblockResponseDto(pkg),
              )
            : undefined;
    }

    @ApiProperty({
        description: 'Infoblock ID',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Infoblock number',
        example: 0,
        type: Number,
    })
    number: number;

    @ApiProperty({
        description: 'Infoblock name',
        example: 'Законодательство России',
        type: String,
    })
    name: string;

    @ApiProperty({
        description: 'Infoblock title',
        example: 'Законодательство России',
        type: String,
        required: false,
        nullable: true,
    })
    title: string | null;

    @ApiProperty({
        description: 'Infoblock description',
        example: 'Описание инфоблока',
        type: String,
        required: false,
        nullable: true,
    })
    description: string | null;

    @ApiProperty({
        description: 'Infoblock description for sale',
        example: 'Описание для продажи',
        type: String,
        required: false,
        nullable: true,
    })
    descriptionForSale: string | null;

    @ApiProperty({
        description: 'Infoblock short description',
        example: 'Краткое описание',
        type: String,
        required: false,
        nullable: true,
    })
    shortDescription: string | null;

    @ApiProperty({
        description: 'Infoblock weight',
        example: '0.5',
        type: String,
    })
    weight: string;

    @ApiProperty({
        description: 'Infoblock code',
        example: 'rus',
        type: String,
    })
    code: string;

    @ApiProperty({
        description: 'Infoblock in group ID',
        example: '0',
        type: String,
        required: false,
        nullable: true,
    })
    inGroupId: string | null;

    @ApiProperty({
        description: 'Infoblock group ID',
        example: '2',
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
        example: null,
        type: Boolean,
        required: false,
        nullable: true,
    })
    isProduct: boolean | null;

    @ApiProperty({
        description: 'Is package',
        example: null,
        type: Boolean,
        required: false,
        nullable: true,
    })
    isPackage: boolean | null;

    @ApiProperty({
        description: 'Tag',
        example: null,
        type: String,
        required: false,
        nullable: true,
    })
    tag: string | null;

    @ApiProperty({
        description: 'Parent ID',
        example: null,
        required: false,
        type: String,
    })
    parent_id: string | null;

    @ApiProperty({
        description: 'Relation ID',
        example: null,
        required: false,
        type: String,
    })
    relation_id: string | null;

    @ApiProperty({
        description: 'Related ID',
        example: null,
        required: false,
        type: String,
    })
    related_id: string | null;

    @ApiProperty({
        description: 'Excluded ID',
        example: null,
        required: false,
        type: String,
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

    @ApiProperty({
        description: 'Infoblock group',
        type: InfogroupResponseDto,
        required: false,
    })
    group?: InfogroupResponseDto;

    @ApiProperty({
        description: 'Parent infoblock',
        type: () => InfoblockResponseDto,
        required: false,
    })
    parent?: InfoblockResponseDto;

    @ApiProperty({
        description: 'Relation infoblock',
        type: () => InfoblockResponseDto,
        required: false,
    })
    relation?: InfoblockResponseDto;

    @ApiProperty({
        description: 'Related infoblock',
        type: () => InfoblockResponseDto,
        required: false,
    })
    related?: InfoblockResponseDto;

    @ApiProperty({
        description: 'Excluded infoblock',
        type: () => InfoblockResponseDto,
        required: false,
    })
    excluded?: InfoblockResponseDto;

    @ApiProperty({
        description: 'Packages',
        type: () => InfoblockResponseDto,
        isArray: true,
        required: false,
    })
    @ValidateNested({ each: true })
    @Type(() => InfoblockResponseDto)
    packages?: InfoblockResponseDto[];

    @ApiProperty({
        description: 'Package infoblocks',
        type: () => InfoblockResponseDto,
        isArray: true,
        required: false,
    })
    @ValidateNested({ each: true })
    @Type(() => InfoblockResponseDto)
    packageInfoblocks?: InfoblockResponseDto[];
}
