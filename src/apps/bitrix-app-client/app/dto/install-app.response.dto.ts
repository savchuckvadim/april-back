import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsString } from "class-validator";

export enum InstallAppStatus {
    SUCCESS = 'success',
    FAIL = 'fail',
}

export class InstallAppFromPortalResponseDto {
    @ApiPropertyOptional({ description: 'Token', example: 'token123' })
    @IsString()
    token: string;

    @ApiProperty({ description: 'Status', example: 'success', enum: ['success', 'fail'] })
    @IsEnum(InstallAppStatus, { message: 'Status must be either success or fail' })
    status: InstallAppStatus;

    @ApiPropertyOptional({ description: 'Message', example: 'Message text' })
    @IsString()
    message: string;
}
