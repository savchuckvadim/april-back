import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, ValidateNested } from "class-validator";

export class GetInitDataDto {
    @ApiProperty({ description: 'Bitrix hook auth', example: 'example.bitrix24.ru', type: String })
    @IsNotEmpty()
    @IsString()
    domain: string;
}
