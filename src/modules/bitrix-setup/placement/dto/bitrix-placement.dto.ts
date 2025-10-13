import { IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BitrixPlacementDto {
    @IsString()
    code: string;

    @IsString()
    type: string;

    @IsString()
    group: string;

    @IsString()
    status: string;

    @IsString()
    bitrix_heandler: string;

    @IsString()
    public_heandler: string;

    @IsString()
    bitrix_codes: string;
}

export class CreateBitrixPlacementDto {
    @IsString()
    domain: string;

    @IsString()
    code: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BitrixPlacementDto)
    placements: BitrixPlacementDto[];
}
