import { BITRIX_APP_CODES } from "@/modules/bitrix-setup/app/enums/bitrix-app.enum";
import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsNumber, IsString } from "class-validator";

export class GetClientPortalAppsRequestDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    clientId: number;

    @ApiProperty({ description: 'Portal ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    portalId: number;


}


export class GetClientPortalAppByCodeRequestDto {
    @ApiProperty({ description: 'Client ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    clientId: number;

    @ApiProperty({ description: 'Portal ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    portalId: number;

    @ApiProperty({ description: 'App Code', example: 'sales_kpi', enum: BITRIX_APP_CODES })
    @IsNotEmpty()
    @IsEnum(BITRIX_APP_CODES)
    appCode: BITRIX_APP_CODES;
}



export class GetClientPortalAppRequestDto {
    @ApiProperty({ description: 'App ID', example: 1 })
    @IsNotEmpty()
    @IsNumber()
    appId: number;


}
