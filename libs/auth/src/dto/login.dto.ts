import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Тело запроса входа SuperUser. Учётные данные сверяются с теми, что заданы
 * в `.env` приложения (`SUPERUSER_LOGIN` / `SUPERUSER_PASSWORD`).
 */
export class LoginDto {
    @ApiProperty({
        description:
            'Логин администратора (должен совпадать с SUPERUSER_LOGIN в .env).',
        type: String,
        example: 'superuser',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    login: string;

    @ApiProperty({
        description:
            'Пароль администратора в открытом виде; сверяется с bcrypt-хэшем из .env.',
        type: String,
        example: 'S3cretP@ss',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    password: string;
}
