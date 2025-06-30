import { IsArray, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from "class-validator";
import { IBxRpaItem } from "../interface/bx-rpa-item.interface";

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

export class ListRpaItemDto {
    @IsNumber()
    @IsNotEmpty()
    id: number;

    @IsString()
    @IsNotEmpty()
    typeId: number;

    @IsObject()
    filter: Partial<IBxRpaItem>;

    @IsOptional()
    @IsArray()
    order: string[];

 
}
