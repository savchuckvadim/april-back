import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class AddClientPortalRequestDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    clientId: number;


    @ApiProperty({ description: 'Domain', example: 'example.com' })
    @IsNotEmpty()
    @IsString()
    domain: string;
}


