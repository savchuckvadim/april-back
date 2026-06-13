import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class PbxUserCreateDto {
    @ApiProperty({
        description:
            'Код пользователя — идентификатор пользователя в Bitrix-портале.',
        example: '123',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code: string;
    @ApiProperty({
        description:
            'Идентификатор портала в PortalDB, к которому привязывается ' +
            'пользователь.',
        example: 1,
        type: Number,
    })
    @IsNumber()
    @IsNotEmpty()
    portalId: number;
}
