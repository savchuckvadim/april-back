import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';
import { FieldDto } from './field.dto';

/** Общая форма CRM-сущностей портала (deal, lead, company, contact), как их отдавал Laravel. */
export abstract class CrmEntityBaseDto {
    @ApiProperty({
        description: 'ID сущности в нашей БД',
        example: 3,
        type: Number,
    })
    @IsNumber()
    id!: number;

    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    portal_id!: number;

    @ApiProperty({
        description: 'Код сущности для ассоциаций',
        example: 'deal',
        type: String,
    })
    @IsString()
    code!: string;

    @ApiProperty({
        description: 'Системное имя сущности',
        example: 'deal',
        type: String,
    })
    @IsString()
    name!: string;

    @ApiProperty({
        description: 'Отображаемое название сущности',
        example: 'Сделка',
        type: String,
    })
    @IsString()
    title!: string;

    @ApiProperty({
        description: 'Пользовательские поля сущности',
        type: [FieldDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FieldDto)
    bitrixfields!: FieldDto[];
}
