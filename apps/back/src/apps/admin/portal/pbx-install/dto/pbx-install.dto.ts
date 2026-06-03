import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsNumber } from 'class-validator';

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

export class PortalStatusDto {
    @ApiProperty({ description: 'Portal domain (e.g., "gsr.bitrix24.ru")' })
    @IsString()
    domain: string;
}

export class TestFieldReadDto {
    @ApiProperty({ description: 'Portal domain' })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Entity type: deal, lead, company, contact, smart, rpa',
    })
    @IsString()
    entityType: string;

    @ApiPropertyOptional({
        description: 'Smart/RPA code (required for smart/rpa entityType)',
    })
    @IsOptional()
    @IsString()
    entityCode?: string;

    @ApiPropertyOptional({
        description: 'Bitrix entity ID to read values from',
    })
    @IsOptional()
    @IsNumber()
    entityId?: number;
}

export class TestFieldWriteDto {
    @ApiProperty({ description: 'Portal domain' })
    @IsString()
    domain: string;

    @ApiProperty({ description: 'Entity type: deal, lead, company, contact' })
    @IsString()
    entityType: string;

    @ApiProperty({ description: 'Bitrix entity ID to write to' })
    @IsNumber()
    entityId: number;

    @ApiProperty({
        description: 'Map of field codes to values, e.g. {"xo_name": "Test"}',
    })
    values: Record<string, unknown>;
}
