import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GetDealsDto {
    @ApiProperty({ description: 'The domain', example: 'example.com' })
    @IsString()
    domain: string;
}
