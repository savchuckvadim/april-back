import { ApiProperty } from "@nestjs/swagger";

export enum BitrixOwnerTypeId {
    COMPANY = 4,
    DEAL = 2,
    CONTACT = 3,
    LEAD = 1
  }
export class CategoryResponseDto {
    @ApiProperty({
        description: 'Category ID',
        example: 1
    })
    id: number;

    @ApiProperty({
        description: 'Category name',
        example: 'New Deals'
    })
    name: string;

    @ApiProperty({
        description: 'Sort order',
        example: 500
    })
    sort: number;

    @ApiProperty({
        description: 'Entity type ID',
        enum: BitrixOwnerTypeId,
        example: BitrixOwnerTypeId.DEAL
    })
    entityTypeId: BitrixOwnerTypeId;

    @ApiProperty({
        description: 'Is default category',
        enum: ['Y', 'N'],
        example: 'N'
    })
    isDefault: "N" | "Y";

    @ApiProperty({
        description: 'Origin ID',
        example: '123'
    })
    originId: string;

    @ApiProperty({
        description: 'Originator ID',
        example: '456'
    })
    originatorId: string;
}

export class GetCategoryResponseDto {
    @ApiProperty({
        description: 'List of categories',
        type: [CategoryResponseDto]
    })
    categories: CategoryResponseDto[];
} 

