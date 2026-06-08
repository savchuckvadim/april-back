import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetPortalKeyDto {
    @ApiProperty({
        description:
            'Открытое значение ключа интеграции. Будет зашифровано ' +
            'перед сохранением в БД и наружу отдаётся уже расшифрованным.',
        example: 'sk_live_51H...redacted',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    value: string;
}
