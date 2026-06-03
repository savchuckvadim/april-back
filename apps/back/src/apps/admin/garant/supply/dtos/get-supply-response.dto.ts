import { SupplyEntity } from '@/modules/garant/supply/supply.entity';
import { ApiProperty } from '@nestjs/swagger';

export class GetSupplyResponseDto {
    constructor(supply: SupplyEntity) {
        this.id = supply.id.toString(); // Преобразуем BigInt в строку для JSON сериализации
        this.name = supply.name;
        this.fullName = supply.fullName;
        this.shortName = supply.shortName;
        this.saleName_1 = supply.saleName_1;
        this.saleName_2 = supply.saleName_2;
        this.saleName_3 = supply.saleName_3;
        this.usersQuantity = supply.usersQuantity;
        this.description = supply.description;
        this.code = supply.code;
        this.type = supply.type;
        this.color = supply.color;
        this.coefficient = supply.coefficient;
        this.contractName = supply.contractName;
        this.contractPropComment = supply.contractPropComment;
        this.contractPropEmail = supply.contractPropEmail;
        this.contractPropLoginsQuantity = supply.contractPropLoginsQuantity;
        this.lcontractName = supply.lcontractName;
        this.lcontractPropComment = supply.lcontractPropComment;
        this.lcontractPropEmail = supply.lcontractPropEmail;
        this.created_at = supply.created_at;
        this.updated_at = supply.updated_at;
    }

    @ApiProperty({
        description: 'Supply ID',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Supply name',
        example: 'Гарант Бухгалтер',
    })
    name: string;

    @ApiProperty({
        description: 'Supply full name',
        example: 'Гарант Бухгалтер',
    })
    fullName: string;

    @ApiProperty({
        description: 'Supply short name',
        example: 'Бухгалтер',
    })
    shortName: string;

    @ApiProperty({
        description: 'Sale name 1',
        example: 'Sale Name 1',
        required: false,
    })
    saleName_1: string | null;

    @ApiProperty({
        description: 'Sale name 2',
        example: 'Sale Name 2',
        required: false,
    })
    saleName_2: string | null;

    @ApiProperty({
        description: 'Sale name 3',
        example: 'Sale Name 3',
        required: false,
    })
    saleName_3: string | null;

    @ApiProperty({
        description: 'Users quantity',
        example: 10,
    })
    usersQuantity: number;

    @ApiProperty({
        description: 'Supply description',
        example: 'Описание поставки',
        required: false,
    })
    description: string | null;

    @ApiProperty({
        description: 'Supply code',
        example: 'buh',
    })
    code: string;

    @ApiProperty({
        description: 'Supply type',
        example: 'prof',
    })
    type: string;

    @ApiProperty({
        description: 'Supply color',
        example: '#FF0000',
        required: false,
    })
    color: string | null;

    @ApiProperty({
        description: 'Coefficient',
        example: 1.5,
    })
    coefficient: number;

    @ApiProperty({
        description: 'Contract name',
        example: 'Contract Name',
        required: false,
    })
    contractName: string | null;

    @ApiProperty({
        description: 'Contract prop comment',
        example: 'Contract Comment',
        required: false,
    })
    contractPropComment: string | null;

    @ApiProperty({
        description: 'Contract prop email',
        example: 'contract@example.com',
        required: false,
    })
    contractPropEmail: string | null;

    @ApiProperty({
        description: 'Contract prop logins quantity',
        example: '10',
        required: false,
    })
    contractPropLoginsQuantity: string | null;

    @ApiProperty({
        description: 'L contract name',
        example: 'L Contract Name',
        required: false,
    })
    lcontractName: string | null;

    @ApiProperty({
        description: 'L contract prop comment',
        example: 'L Contract Comment',
        required: false,
    })
    lcontractPropComment: string | null;

    @ApiProperty({
        description: 'L contract prop email',
        example: 'lcontract@example.com',
        required: false,
    })
    lcontractPropEmail: string | null;

    @ApiProperty({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
    })
    created_at: Date | null;

    @ApiProperty({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
        required: false,
    })
    updated_at: Date | null;
}
