import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PortalSessionState } from '../services/marketplace-session.service';

export class ExchangeSessionCodeDto {
    @ApiProperty({
        description:
            'Одноразовый код сессии из query redirect-а (живёт 60 секунд, сжигается при обмене)',
        example: 'f2b7c1d0-3c4a-4e0e-9b1a-2f6d8a9c0e11',
        type: String,
    })
    @IsUUID()
    @IsNotEmpty()
    code: string;
}

export class PortalSessionDto {
    @ApiProperty({
        description:
            'Portal-context JWT (role=CLIENT; общий AUTH_JWT_SECRET → валиден во всех приложениях). Хранить в памяти фронта, слать Bearer-ом',
        example: 'eyJhbGciOiJIUzI1NiIs...',
        type: String,
    })
    @IsString()
    token: string;

    @ApiProperty({
        description: 'Состояние допуска портала',
        example: PortalSessionState.ONBOARDING,
        enum: PortalSessionState,
    })
    state: PortalSessionState;

    @ApiPropertyOptional({
        description: 'Домен портала Bitrix24',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsOptional()
    @IsString()
    domain?: string;

    @ApiProperty({
        description: 'member_id портала',
        example: 'a223c6b3710f85df22e9377d6c4f7553',
        type: String,
    })
    @IsString()
    memberId: string;

    @ApiProperty({
        description:
            'Пользователь портала из REST profile (имя, фамилия, признак администратора; email — из user.current, только на состоянии onboarding для предзаполнения формы)',
        example: {
            name: 'Иван',
            lastName: 'Петров',
            isAdmin: true,
            email: 'ivan@romashka.ru',
        },
        type: Object,
    })
    user: {
        name?: string;
        lastName?: string;
        isAdmin: boolean;
        email?: string;
    };
}
