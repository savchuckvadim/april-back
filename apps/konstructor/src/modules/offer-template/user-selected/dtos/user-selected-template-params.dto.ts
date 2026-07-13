import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class UserSelectedTemplateIdParamsDto {
    @ApiProperty({ description: 'The user selected template id', example: 1 })
    @IsNumber()
    @IsPositive()
    id: number;

    @ApiProperty({ description: 'The portal id', example: 1 })
    @IsNumber()
    @IsPositive()
    portal_id: number;

    @ApiProperty({ description: 'The user id', example: 1 })
    @IsNumber()
    @IsPositive()
    user_id: number;
}
