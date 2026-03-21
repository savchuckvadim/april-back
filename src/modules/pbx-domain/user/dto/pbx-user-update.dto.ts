import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PbxUserUpdateDto {
    @ApiProperty({
        description: 'User code',
        example: '123',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;
}
