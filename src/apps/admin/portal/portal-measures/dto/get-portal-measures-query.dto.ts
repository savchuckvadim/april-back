import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class GetPortalMeasuresQueryDto {
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
        description: 'Measure ID',
        example: 1,
        required: false,
        nullable: true,
    })
    @IsNumber()
    @IsOptional()
    measureId?: number;
}
