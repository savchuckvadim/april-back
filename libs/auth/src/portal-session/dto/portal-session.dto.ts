import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import {
    PortalSession,
    PortalSessionOpenInput,
    PortalSessionUser,
} from '../portal-session.types';

/** Тело запроса на открытие portal-context сессии (данные BX24.getAuth()). */
export class PortalSessionOpenDto implements PortalSessionOpenInput {
    @ApiProperty({
        description:
            'Домен портала Bitrix24 — имя хоста, как в BX24.getAuth().domain ' +
            '(без схемы и пути).',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(253)
    domain: string;

    @ApiProperty({
        description:
            'AUTH_ID фрейма: access_token текущего пользователя из ' +
            'BX24.getAuth(). Проверяется живым REST-вызовом profile на портале.',
        type: String,
        example: '0a1b2c3d4e5f60718293a4b5c6d7e8f9',
    })
    @IsString()
    @IsNotEmpty()
    accessToken: string;

    @ApiPropertyOptional({
        description:
            'Идентификатор member_id портала из BX24.getAuth() — только ' +
            'для журналирования.',
        type: String,
        example: 'f3d1c2b0a9e8d7c6b5a4f3e2d1c0b9a8',
    })
    @IsOptional()
    @IsString()
    memberId?: string;
}

/** Пользователь портала, получивший сессию. */
export class PortalSessionUserDto implements PortalSessionUser {
    @ApiProperty({
        description: 'Bitrix-id пользователя (строкой, как в REST).',
        type: String,
        example: '447',
    })
    @IsString()
    id: string;

    @ApiProperty({
        description: 'Имя пользователя; null — не заполнено на портале.',
        type: String,
        nullable: true,
        example: 'Иван',
    })
    name: string | null;

    @ApiProperty({
        description: 'Фамилия пользователя; null — не заполнена на портале.',
        type: String,
        nullable: true,
        example: 'Петров',
    })
    lastName: string | null;

    @ApiProperty({
        description: 'Администратор портала (profile.ADMIN).',
        type: Boolean,
        example: false,
    })
    @IsBoolean()
    isAdmin: boolean;
}

/** Ответ обмена: токен и кто его получил. */
export class PortalSessionDto implements PortalSession {
    @ApiProperty({
        description:
            'portal-context JWT: role=CLIENT, domain, bitrixUserId, isAdmin. ' +
            'Фронт держит его в памяти и шлёт заголовком Authorization: Bearer.',
        type: String,
        example:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwb3J0YWwifQ.sig',
    })
    @IsString()
    token: string;

    @ApiProperty({
        description:
            'Истечение токена, ISO (UTC); null — токен без срока. После ' +
            'истечения фронт открывает сессию заново тем же запросом.',
        type: String,
        nullable: true,
        example: '2026-09-22T02:00:00.000Z',
    })
    expiresAt: string | null;

    @ApiProperty({
        description:
            'Домен портала, для которого выдан токен (нормализованный).',
        type: String,
        example: 'april.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiProperty({
        description: 'Пользователь портала по данным REST-метода profile.',
        type: PortalSessionUserDto,
    })
    @ValidateNested()
    @Type(() => PortalSessionUserDto)
    user: PortalSessionUserDto;
}
