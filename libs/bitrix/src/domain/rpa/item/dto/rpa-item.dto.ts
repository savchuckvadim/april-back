import {
    IsNotEmpty,
    IsNumber,
    IsObject,
    IsOptional,
    IsString,
} from 'class-validator';
import { IBxRpaItem } from '../interface/bx-rpa-item.interface';

export class GetRpaItemDto {
    @IsNumber()
    @IsNotEmpty()
    id: number;

    @IsString()
    @IsNotEmpty()
    typeId: number;
}

export class AddRpaItemDto {
    @IsString()
    @IsNotEmpty()
    typeId: number;

    @IsObject()
    fields: Partial<IBxRpaItem>;
}

export class UpdateRpaItemDto {
    @IsNumber()
    @IsNotEmpty()
    id: number;

    @IsString()
    @IsNotEmpty()
    typeId: number;

    @IsObject()
    fields: Partial<IBxRpaItem>;
}

/**
 * `rpa.item.list`: фильтр по системным полям — camelCase, по UF — как есть
 * (UPPER_CASE), операторы префиксом ключа (`>=movedTime`); сортировка —
 * поле → `ASC`/`DESC`; `start` — сдвиг страницы (`next` из ответа).
 */
export class ListRpaItemDto {
    @IsString()
    @IsNotEmpty()
    typeId: number;

    @IsOptional()
    @IsObject()
    filter?: Partial<IBxRpaItem> | Record<string, unknown>;

    @IsOptional()
    @IsObject()
    order?: Record<string, 'ASC' | 'DESC' | 'asc' | 'desc'>;

    @IsOptional()
    @IsNumber()
    start?: number;
}
