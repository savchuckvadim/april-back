import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class BxListItemGetRequestDto {
    @ApiProperty({ description: 'Код инфоблока' })
    @IsString()
    IBLOCK_CODE?: string;

    @ApiProperty({ description: 'ID инфоблока' })
    @IsString()
    IBLOCK_ID?: string;

    /**
     * Точная адресация элемента символьным кодом — первоклассный параметр
     * lists.element.get. Для дедупа KPI-финалов обязателен: фильтр по CODE
     * REST списков не гарантирует (неподдержанный ключ молча выбрасывается,
     * метод отдаёт первую страницу всех элементов).
     */
    @ApiProperty({ description: 'Символьный код элемента', required: false })
    @IsString()
    @IsOptional()
    ELEMENT_CODE?: string;

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
