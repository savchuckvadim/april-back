import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePortalDealDto {
    @ApiPropertyOptional({
        description: 'ID портала',
        example: 1,
        type: Number,
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    portalId?: number;

    @ApiPropertyOptional({ description: 'Системное имя', type: String })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ description: 'Заголовок', type: String })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiPropertyOptional({ description: 'Код', type: String })
    @IsOptional()
    @IsString()
    code?: string;
}
