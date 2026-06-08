import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PortalSmartRowResponseDto {
    @ApiProperty()
    id: number;

    @ApiProperty()
    portalId: number;

    @ApiProperty()
    type: string;

    @ApiProperty()
    group: string;

    @ApiProperty()
    name: string;

    @ApiProperty()
    title: string;

    @ApiPropertyOptional()
    bitrixId?: number | null;

    @ApiProperty()
    entityTypeId: number;

    @ApiPropertyOptional()
    forStageId?: number | null;

    @ApiPropertyOptional()
    forFilterId?: number | null;

    @ApiPropertyOptional()
    crmId?: number | null;

    @ApiPropertyOptional()
    forStage?: string | null;

    @ApiPropertyOptional()
    forFilter?: string | null;

    @ApiPropertyOptional()
    crm?: string | null;

    @ApiPropertyOptional()
    created_at?: Date | null;

    @ApiPropertyOptional()
    updated_at?: Date | null;
}
