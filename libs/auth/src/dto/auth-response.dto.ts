import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role, ROLE_VALUES } from '../types/role.enum';
import { AuthUser } from '../types/auth-user.interface';

/**
 * Публичное представление аутентифицированного субъекта (без секретов).
 */
export class AuthUserDto implements AuthUser {
    @ApiProperty({
        description:
            'Идентификатор субъекта (для SuperUser совпадает с логином).',
        type: String,
        example: 'superuser',
    })
    @IsString()
    @IsNotEmpty()
    sub: string;

    @ApiProperty({
        description: 'Логин субъекта.',
        type: String,
        example: 'superuser',
    })
    @IsString()
    @IsNotEmpty()
    login: string;

    @ApiProperty({
        description:
            'Роль субъекта, определяющая доступ к защищённым эндпоинтам.',
        enum: ROLE_VALUES,
        example: Role.SUPER_USER,
    })
    @IsEnum(Role)
    role: Role;

    @ApiPropertyOptional({
        description:
            'Идентификатор клиента (только для будущей клиентской авторизации).',
        type: Number,
        example: 1,
    })
    @IsOptional()
    @IsInt()
    clientId?: number;

    @ApiPropertyOptional({
        description:
            'Идентификатор портала Bitrix (только для будущей клиентской авторизации).',
        type: Number,
        example: 42,
    })
    @IsOptional()
    @IsInt()
    portalId?: number;
}

/**
 * Ответ на успешный вход: access-токен и данные субъекта.
 */
export class AuthResponseDto {
    @ApiProperty({
        description:
            'Access-токен (JWT). Передаётся в заголовке Authorization: Bearer <token>.',
        type: String,
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    })
    @IsString()
    @IsNotEmpty()
    accessToken: string;

    @ApiProperty({
        description: 'Данные аутентифицированного субъекта.',
        type: AuthUserDto,
    })
    @IsObject()
    @ValidateNested()
    @Type(() => AuthUserDto)
    user: AuthUserDto;
}
