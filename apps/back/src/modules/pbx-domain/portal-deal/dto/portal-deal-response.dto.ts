import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PortalDealResponseDto {
    @ApiProperty({ example: 1, type: Number })
    id!: number;

    @ApiProperty({ example: 1, type: Number })
    portalId!: number;

    @ApiProperty({ type: String })
    name!: string;

    @ApiProperty({ type: String })
    title!: string;

    @ApiProperty({ type: String })
    code!: string;

    @ApiPropertyOptional({ type: Date, nullable: true })
    createdAt?: Date | null;

    @ApiPropertyOptional({ type: Date, nullable: true })
    updatedAt?: Date | null;
}
