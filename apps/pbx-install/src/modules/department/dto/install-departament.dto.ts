import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

/**
 * Тело запроса установки отдела.
 * В Bitrix ничего не создаётся — присылаем id уже существующего отдела.
 */
export class InstallDepartamentDto {
    @ApiProperty({
        description: 'ID существующего отдела в Bitrix (department ID)',
        example: 5,
        type: Number,
    })
    @IsInt()
    @Min(1)
    bitrixId!: number;
}
