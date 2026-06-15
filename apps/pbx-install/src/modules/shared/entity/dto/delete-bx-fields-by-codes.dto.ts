import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * Тело запроса на удаление полей сущности **только в Bitrix** по списку code.
 * Домен передаётся в пути (`:domain`), поэтому в теле его нет.
 */
export class DeleteBxFieldsByCodesDto {
    @ApiProperty({
        description:
            'Список code полей для удаления только в Bitrix. Имя UF_*-поля ' +
            'резолвится из живого Bitrix (по XML_ID/FIELD_NAME).',
        example: ['op_status'],
        type: [String],
    })
    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    codes!: string[];
}
