import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PbxUserUpdateDto {
    @ApiProperty({
        description:
            'Код пользователя — идентификатор пользователя в Bitrix-портале.',
        example: '123',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;
}
