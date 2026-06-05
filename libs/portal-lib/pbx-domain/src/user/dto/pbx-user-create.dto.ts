import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class PbxUserCreateDto {
    @ApiProperty({
        description: 'User code',
        example: '123',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;
    @ApiProperty({
        description: 'Portal ID',
        example: 1,
        type: Number,
    })
    @IsNumber()
    @IsNotEmpty()
    portalId: number;
}
