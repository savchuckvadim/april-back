import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

export class BitrixHookAuthRequestDto {
    @ApiProperty({ description: 'Bitrix hook domain' })
    @IsString()
    domain: string;
}

export class InitDealDto {
    @ApiProperty({ description: 'Bitrix hook auth' })
    @ValidateNested()
    @Type(() => BitrixHookAuthRequestDto)
    auth: BitrixHookAuthRequestDto;

    @ApiProperty({ description: 'Document id info', type: [String] })
    @IsArray()
    @IsString({
        each: true,
        message: 'document_id must be an array of strings',
    })
    document_id: string[];
}
