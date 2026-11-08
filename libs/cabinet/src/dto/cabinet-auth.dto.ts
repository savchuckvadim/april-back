import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    Length,
    MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
    CABINET_PASSWORD_LINK_PURPOSES,
    CabinetPasswordLinkPurpose,
} from '../domain/cabinet.constants';
import {
    CABINET_PASSWORD_MAX_LENGTH,
    CABINET_PASSWORD_MIN_LENGTH,
} from '../infrastructure/password-hasher';
import { PasswordLinkState } from '../session/cabinet-password.service';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CabinetLoginDto {
    @ApiProperty({
        description:
            'Email учётной записи кабинета — тот, на который пришла ссылка установки пароля.',
        type: String,
        example: 'director@company.ru',
    })
    @Transform(trimLower)
    @IsEmail({}, { message: 'Укажите email' })
    @MaxLength(255)
    email!: string;

    @ApiProperty({
        description: 'Пароль учётной записи кабинета.',
        type: String,
        example: 'Пароль2026',
    })
    @IsString()
    @IsNotEmpty({ message: 'Укажите пароль' })
    @MaxLength(CABINET_PASSWORD_MAX_LENGTH)
    password!: string;
}

export class CabinetSessionDto {
    @ApiProperty({
        description:
            'Access-токен кабинета (JWT на общем секрете приложений). Хранить только в памяти вкладки и слать заголовком Authorization: Bearer. Refresh-токен — в httpOnly-cookie, JS его не видит.',
        type: String,
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    })
    accessToken!: string;

    @ApiPropertyOptional({
        description:
            'Когда access-токен истекает (ISO). До этого фронт обновляет его ручкой refresh.',
        type: String,
        example: '2026-11-08T12:15:00.000Z',
        nullable: true,
    })
    accessExpiresAt!: string | null;

    @ApiProperty({
        description: 'ID учётной записи кабинета (users.id).',
        type: Number,
        example: 17,
    })
    userId!: number;
}

export class CabinetForgotPasswordDto {
    @ApiProperty({
        description:
            'Email учётной записи. Ответ одинаковый, есть такая учётка или нет — по нему нельзя проверять адреса.',
        type: String,
        example: 'director@company.ru',
    })
    @Transform(trimLower)
    @IsEmail({}, { message: 'Укажите email' })
    @MaxLength(255)
    email!: string;
}

export class CabinetSetPasswordDto {
    @ApiProperty({
        description: 'Токен из ссылки установки или восстановления пароля.',
        type: String,
        example: '3f9a…c1',
    })
    @IsString()
    @Length(32, 200)
    token!: string;

    @ApiProperty({
        description: `Новый пароль: от ${CABINET_PASSWORD_MIN_LENGTH} до ${CABINET_PASSWORD_MAX_LENGTH} символов, хотя бы одна цифра и одна буква.`,
        type: String,
        example: 'Пароль2026',
    })
    @IsString()
    @Length(CABINET_PASSWORD_MIN_LENGTH, CABINET_PASSWORD_MAX_LENGTH, {
        message: `Пароль — от ${CABINET_PASSWORD_MIN_LENGTH} до ${CABINET_PASSWORD_MAX_LENGTH} символов`,
    })
    password!: string;
}

export class CabinetPasswordLinkStateDto implements PasswordLinkState {
    @ApiProperty({
        description: 'Ссылка действует: можно показывать форму нового пароля.',
        type: Boolean,
        example: true,
    })
    valid!: boolean;

    @ApiPropertyOptional({
        description:
            'Назначение ссылки: setup — первый пароль (приглашение), reset — восстановление.',
        type: String,
        enum: CABINET_PASSWORD_LINK_PURPOSES,
        example: 'setup',
        nullable: true,
    })
    purpose!: CabinetPasswordLinkPurpose | null;

    @ApiPropertyOptional({
        description: 'Маска email учётки — чтобы человек узнал свой адрес.',
        type: String,
        example: 'd***@company.ru',
        nullable: true,
    })
    emailMasked!: string | null;
}

export class CabinetOkDto {
    @ApiProperty({
        description: 'Действие выполнено.',
        type: Boolean,
        example: true,
    })
    ok!: boolean;
}
