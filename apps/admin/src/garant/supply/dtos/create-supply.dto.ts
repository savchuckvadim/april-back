import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateSupplyDto {
    @ApiProperty({
        description: 'Название поставки',
        example: 'Гарант Бухгалтер',
    })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Полное название поставки',
        example: 'Гарант Бухгалтер',
    })
    @IsString()
    fullName: string;

    @ApiProperty({
        description: 'Короткое название поставки',
        example: 'Бухгалтер',
    })
    @IsString()
    shortName: string;

    @ApiProperty({
        description: 'Название продажи 1',
        required: false,
        example: 'Sale Name 1',
    })
    @IsString()
    @IsOptional()
    saleName_1?: string | null;

    @ApiProperty({
        description: 'Название продажи 2',
        required: false,
        example: 'Sale Name 2',
    })
    @IsString()
    @IsOptional()
    saleName_2?: string | null;

    @ApiProperty({
        description: 'Название продажи 3',
        required: false,
        example: 'Sale Name 3',
    })
    @IsString()
    @IsOptional()
    saleName_3?: string | null;

    @ApiProperty({
        description: 'Количество пользователей',
        example: 10,
    })
    @IsNumber()
    usersQuantity: number;

    @ApiProperty({
        description: 'Описание поставки',
        required: false,
        example: 'Описание поставки',
    })
    @IsString()
    @IsOptional()
    description?: string | null;

    @ApiProperty({
        description: 'Код поставки',
        example: 'buh',
    })
    @IsString()
    code: string;

    @ApiProperty({
        description: 'Тип поставки',
        example: 'prof',
    })
    @IsString()
    type: string;

    @ApiProperty({
        description: 'Цвет поставки',
        required: false,
        example: '#FF0000',
    })
    @IsString()
    @IsOptional()
    color?: string | null;

    @ApiProperty({
        description: 'Коэффициент',
        example: 1.5,
    })
    @IsNumber()
    coefficient: number;

    @ApiProperty({
        description: 'Название контракта',
        required: false,
        example: 'Contract Name',
    })
    @IsString()
    @IsOptional()
    contractName?: string | null;

    @ApiProperty({
        description: 'Комментарий к контракту',
        required: false,
        example: 'Contract Comment',
    })
    @IsString()
    @IsOptional()
    contractPropComment?: string | null;

    @ApiProperty({
        description: 'Email контракта',
        required: false,
        example: 'contract@example.com',
    })
    @IsString()
    @IsOptional()
    contractPropEmail?: string | null;

    @ApiProperty({
        description: 'Количество логинов контракта',
        required: false,
        example: '10',
    })
    @IsString()
    @IsOptional()
    contractPropLoginsQuantity?: string | null;

    @ApiProperty({
        description: 'Название L-контракта',
        required: false,
        example: 'L Contract Name',
    })
    @IsString()
    @IsOptional()
    lcontractName?: string | null;

    @ApiProperty({
        description: 'Комментарий L-контракта',
        required: false,
        example: 'L Contract Comment',
    })
    @IsString()
    @IsOptional()
    lcontractPropComment?: string | null;

    @ApiProperty({
        description: 'Email L-контракта',
        required: false,
        example: 'lcontract@example.com',
    })
    @IsString()
    @IsOptional()
    lcontractPropEmail?: string | null;
}
