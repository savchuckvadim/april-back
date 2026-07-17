import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { IFieldItem } from '@lib/portal-lib/portal/interfaces/portal.interface';

/** Элемент (значение) списочного поля Битрикс, как его отдавал Laravel. */
export class FieldItemDto implements IFieldItem {
    @ApiProperty({
        description: 'ID элемента в нашей БД',
        example: 10,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'Дата создания записи',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsDate()
    created_at!: Date;

    @ApiProperty({
        description: 'Дата обновления записи',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
        nullable: true,
        required: false,
    })
    @IsOptional()
    @IsDate()
    updated_at!: Date;

    @ApiProperty({
        description: 'ID родительского поля bitrixfields',
        example: 5,
        type: Number,
    })
    @IsNumber()
    bitrixfield_id!: number;

    @ApiProperty({
        description: 'Системное имя элемента',
        example: 'nok',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название элемента',
        example: 'НОК',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'Код элемента для ассоциаций',
        example: 'nok',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'ID элемента списка в Битрикс',
        example: 128,
        type: Number,
    })
    @IsInt()
    bitrixId!: number;
}
