import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsArray, IsNumber } from 'class-validator';

export class InstallForPortalDto {
    @ApiProperty({ description: 'Portal ID' })
    @IsNumber()
    portalId: number;

    @ApiPropertyOptional({ description: 'Group filter (e.g., "sales")' })
    @IsOptional()
    @IsString()
    group?: string;

    @ApiProperty({
        description: 'Whether to sync with Bitrix API or DB-only',
        default: false,
    })
    @IsBoolean()
    withBitrixSync: boolean;
}

export class MassInstallDto {
    @ApiPropertyOptional({ description: 'Group filter (e.g., "sales")' })
    @IsOptional()
    @IsString()
    group?: string;

    @ApiProperty({
        description: 'Whether to sync with Bitrix API or DB-only',
        default: false,
    })
    @IsBoolean()
    withBitrixSync: boolean;
}

export class RegistryInfoDto {
    @ApiProperty()
    totalGroups: number;

    @ApiProperty()
    totalFields: number;

    @ApiProperty()
    totalCategories: number;

    @ApiProperty()
    totalSmarts: number;

    @ApiProperty()
    totalRpas: number;

    @ApiProperty()
    groups: string[];
}
