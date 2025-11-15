import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber } from "class-validator";

export class GetPortalAppsDto {
    @ApiProperty({ description: 'Portal ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    portalId: number;
}
