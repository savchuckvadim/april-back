import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class GetClientPortalsRequestDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    clientId: number;
}


