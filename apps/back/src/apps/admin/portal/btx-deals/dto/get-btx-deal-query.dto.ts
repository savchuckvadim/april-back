import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class GetBtxDealsQueryDto {
    @ApiPropertyOptional({
        description: 'Portal ID',
        example: 1,
        required: false,
        nullable: true,
    })
    @IsNumber()
    @IsOptional()
    portal_id?: number;
}
