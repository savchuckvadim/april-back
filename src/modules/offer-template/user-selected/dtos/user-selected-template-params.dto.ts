import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class UserSelectedTemplateIdParamsDto {
    @ApiProperty({ description: 'The user selected template id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;
}
