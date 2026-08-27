import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

/** Тело исходящего вебхука робота Bitrix — та же форма, что у init-deal. */
export class InitTaskAccountantAuthDto {
    @ApiProperty({ description: 'Домен портала' })
    @IsString()
    domain: string;
}

export class InitTaskAccountantDto {
    @ApiProperty({ description: 'Авторизация хука' })
    @ValidateNested()
    @Type(() => InitTaskAccountantAuthDto)
    auth: InitTaskAccountantAuthDto;

    @ApiProperty({
        description: 'document_id робота: ["rpa", "...", "<typeId>:<itemId>"]',
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    document_id: string[];
}
