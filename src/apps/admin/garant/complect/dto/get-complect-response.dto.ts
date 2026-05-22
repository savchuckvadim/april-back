import { ComplectEntity } from '@/modules/garant/complect/complect.entity';
import {
    ComplectProductTypeEnum,
    ComplectTypeEnum,
} from '@/modules/garant/complect/types/complect.type';
import { ApiProperty } from '@nestjs/swagger';
import { InfoblockResponseDto } from '../../infoblock/dto/infoblock-response.dto';

export class GetComplectResponseDto {
    constructor(complect: ComplectEntity) {
        this.id = complect.id;
        this.name = complect.name;
        this.fullName = complect.fullName;
        this.shortName = complect.shortName;
        this.description = complect.description;
        this.code = complect.code;
        this.type = complect.type;
        this.color = complect.color;
        this.weight = complect.weight;
        this.abs = complect.abs;
        this.number = complect.number;
        this.productType = complect.productType;
        this.withABS = complect.withABS;
        this.withConsalting = complect.withConsalting;
        this.withServices = complect.withServices;
        this.withLt = complect.withLt;
        this.isChanging = complect.isChanging;
        this.withDefault = complect.withDefault;
        this.created_at = complect.created_at;
        this.updated_at = complect.updated_at;
        this.infoblocks = complect.infoblocks
            ? complect.infoblocks.map(
                  infoblock => new InfoblockResponseDto(infoblock),
              )
            : undefined;
    }

    @ApiProperty({
        description: 'Complect ID',
        example: '1',
    })
    id: string;

    @ApiProperty({
        description: 'Complect name',
        example: 'Гарант Бухгалтер',
    })
    name: string;

    @ApiProperty({
        description: 'Complect full name',
        example: 'Гарант Бухгалтер',
    })
    fullName: string;

    @ApiProperty({
        description: 'Complect short name',
        example: 'Бухгалтер',
    })
    shortName: string;

    @ApiProperty({
        description: 'Complect description',
        example: 'для Бухгалтера',
        required: false,
    })
    description?: string;

    @ApiProperty({
        description: 'Complect code',
        example: 'buh',
    })
    code: string;

    @ApiProperty({
        description: 'Complect type',
        example: ComplectTypeEnum.PROF,
        enum: ComplectTypeEnum,
    })
    type: ComplectTypeEnum;

    @ApiProperty({
        description: 'Complect color',
        example: '#FF0000',
        required: false,
    })
    color?: string;

    @ApiProperty({
        description: 'Complect weight',
        example: 3.5,
    })
    weight: number;

    @ApiProperty({
        description: 'Complect abs',
        example: '1.5',
        required: false,
    })
    abs?: string;

    @ApiProperty({
        description: 'Complect number',
        example: 1,
    })
    number: number;

    @ApiProperty({
        description: 'Product type',
        example: ComplectProductTypeEnum.GARANT,
        enum: ComplectProductTypeEnum,
    })
    productType: ComplectProductTypeEnum;

    @ApiProperty({
        description: 'With ABS',
        example: false,
    })
    withABS: boolean;

    @ApiProperty({
        description: 'With consalting',
        example: false,
    })
    withConsalting: boolean;

    @ApiProperty({
        description: 'With services',
        example: true,
    })
    withServices: boolean;

    @ApiProperty({
        description: 'With LT',
        example: false,
    })
    withLt: boolean;

    @ApiProperty({
        description: 'Is changing',
        example: true,
    })
    isChanging: boolean;

    @ApiProperty({
        description: 'With default',
        example: false,
    })
    withDefault: boolean;

    @ApiProperty({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
    })
    created_at?: Date;

    @ApiProperty({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
    })
    updated_at?: Date;

    @ApiProperty({
        description: 'Infoblocks',
        type: () => InfoblockResponseDto,
        isArray: true,
        required: false,
    })
    infoblocks?: InfoblockResponseDto[];
}
