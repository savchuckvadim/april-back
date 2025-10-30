import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsObject, IsOptional, IsString } from "class-validator";

export class BxListItemGetRequestDto {

    @ApiProperty({ description: 'Код инфоблока' })
    @IsString()
    IBLOCK_CODE?:
        | string
        | 'sales_kpi'
        | 'sales_history'
        | 'presentation'
        | 'ork_history';

    @ApiProperty({ description: 'ID инфоблока' })
    @IsString()
    IBLOCK_ID?: string;

    @ApiProperty({ description: 'Фильтр' })
    @IsObject()
    filter?: Record<string, any>;

    @ApiProperty({ description: 'Выбранные поля' })
    @IsArray()
    @IsOptional()
    select?: string[];

    @ApiProperty({ description: 'Сортировка' })
    @IsObject()
    @IsOptional()
    order?: Record<string, any>;
}
