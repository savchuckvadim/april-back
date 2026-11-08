import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import { CABINET_ROLES, CabinetRole } from '../domain/cabinet.constants';
import { CabinetMemberView } from '../members/cabinet-member.view';
import { FrameAccessStatus } from '../frame/cabinet-frame-access.service';

const trim = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim() : value;
const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

export class CabinetMemberDto implements CabinetMemberView {
    @ApiProperty({
        description:
            'ID членства (portal_users.id) — адрес действий над участником.',
        type: String,
        example: '6f1c2b8e-3a1d-4c5e-9b7a-2d4e6f8a0b1c',
    })
    id!: string;

    @ApiProperty({
        description: 'ID учётной записи (users.id).',
        type: Number,
        example: 17,
    })
    userId!: number;

    @ApiPropertyOptional({
        description: 'Email учётной записи.',
        type: String,
        example: 'manager@company.ru',
        nullable: true,
    })
    email!: string | null;

    @ApiProperty({ description: 'Имя.', type: String, example: 'Анна' })
    firstName!: string;

    @ApiProperty({ description: 'Фамилия.', type: String, example: 'Смирнова' })
    lastName!: string;

    @ApiProperty({
        description:
            'Роль: owner — владелец (один на портал), member — участник, pending — заявка из Битрикса ждёт подтверждения.',
        type: String,
        enum: CABINET_ROLES,
        example: 'member',
    })
    role!: CabinetRole;

    @ApiPropertyOptional({
        description:
            'ID сотрудника на портале Битрикс24 — связывает учётку с сессией приложения во фрейме.',
        type: String,
        example: '231',
        nullable: true,
    })
    bitrixUserId!: string | null;

    @ApiProperty({
        description: 'Доступ снят (строка оставлена для истории).',
        type: Boolean,
        example: false,
    })
    revoked!: boolean;

    @ApiProperty({
        description: 'Пароль задан — может входить с сайта.',
        type: Boolean,
        example: true,
    })
    hasPassword!: boolean;

    @ApiPropertyOptional({
        description: 'Когда дан доступ (ISO).',
        type: String,
        example: '2026-11-08T09:30:00.000Z',
        nullable: true,
    })
    createdAt!: string | null;
}

export class CabinetPersonDto {
    @ApiProperty({
        description: 'Email человека: на него придёт ссылка установки пароля.',
        type: String,
        example: 'manager@company.ru',
    })
    @Transform(trimLower)
    @IsEmail({}, { message: 'Укажите email' })
    @MaxLength(255)
    email!: string;

    @ApiProperty({ description: 'Имя.', type: String, example: 'Анна' })
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Укажите имя' })
    @MaxLength(255)
    firstName!: string;

    @ApiProperty({ description: 'Фамилия.', type: String, example: 'Смирнова' })
    @Transform(trim)
    @IsString()
    @IsNotEmpty({ message: 'Укажите фамилию' })
    @MaxLength(255)
    lastName!: string;
}

export class CabinetAddMemberDto extends CabinetPersonDto {
    @ApiPropertyOptional({
        description:
            'ID сотрудника на портале Битрикс24 — если известен: тогда, открыв приложение в Битриксе, человек сразу получит свои права.',
        type: String,
        example: '231',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{1,10}$/, { message: 'ID сотрудника Битрикс24 — число' })
    bitrixUserId?: string;

    @ApiPropertyOptional({
        description:
            'Сразу сделать владельцем (прежний владелец станет участником). Только для администратора April.',
        type: Boolean,
        example: false,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    makeOwner?: boolean;
}

export class CabinetPasswordLinkDto {
    @ApiProperty({
        description:
            'Ссылка установки/восстановления пароля. Одноразовая. Если письмо не ушло — передайте её человеку сами (не в общий чат).',
        type: String,
        example: 'https://bitrix.april-app.ru/auth/set-password/3f9a…c1',
    })
    url!: string;

    @ApiProperty({
        description: 'Когда ссылка перестанет действовать (ISO).',
        type: String,
        example: '2026-11-15T09:30:00.000Z',
    })
    expiresAt!: string;

    @ApiProperty({
        description: 'Письмо со ссылкой принято почтовым сервером.',
        type: Boolean,
        example: false,
    })
    emailSent!: boolean;
}

export class CabinetInviteResultDto {
    @ApiProperty({
        description: 'Участник после добавления.',
        type: CabinetMemberDto,
    })
    member!: CabinetMemberDto;

    @ApiPropertyOptional({
        description:
            'Ссылка установки пароля — только для учётки без пароля; у учётки с паролем пусто (входит как обычно).',
        type: CabinetPasswordLinkDto,
        nullable: true,
    })
    passwordLink!: CabinetPasswordLinkDto | null;
}

export class CabinetFrameAccessStatusDto implements FrameAccessStatus {
    @ApiPropertyOptional({
        description:
            'Роль сотрудника в кабинете портала; pending — заявка ждёт подтверждения; пусто — доступа к кабинету с сайта нет.',
        type: String,
        enum: CABINET_ROLES,
        example: 'pending',
        nullable: true,
    })
    role!: CabinetRole | null;

    @ApiPropertyOptional({
        description: 'ID членства (если есть).',
        type: String,
        example: '6f1c2b8e-3a1d-4c5e-9b7a-2d4e6f8a0b1c',
        nullable: true,
    })
    membershipId!: string | null;

    @ApiPropertyOptional({
        description: 'Маска email учётки.',
        type: String,
        example: 'a***@company.ru',
        nullable: true,
    })
    emailMasked!: string | null;

    @ApiProperty({
        description: 'Пароль задан — можно входить с сайта.',
        type: Boolean,
        example: false,
    })
    hasPassword!: boolean;
}
