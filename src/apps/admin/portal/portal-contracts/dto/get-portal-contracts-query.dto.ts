import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class GetPortalContractsQueryDto {
    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
        required: false,
        nullable: true,
    })
    @IsNumber()
    @IsOptional()
    portalId?: number;

    @ApiPropertyOptional({
        description: 'Contract ID',
        example: 1,
        required: false,
        nullable: true,
    })
    @IsNumber()
    @IsOptional()
    contractId?: number;
}
