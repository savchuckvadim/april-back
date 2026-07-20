import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO кодов подключения (invite) маркетплейс-приложения «Менеджер Гарант».
 *
 * Код подключения выдаётся клиенту ДО установки приложения: клиент ставит
 * приложение из Битрикс24.Маркет, открывает его и вводит код — портал
 * подключается к сервису April.
 *
 * САМ КОД НИКОГДА НЕ ХРАНИТСЯ: в БД лежит только sha256-хэш. Открытый код
 * возвращается ровно один раз — в ответе на выпуск/перевыпуск.
 */

/** Статусы жизненного цикла кода подключения (portal_invites.status) */
export const INVITE_STATUSES = [
    'issued',
    'sent',
    'redeemed',
    'revoked',
    'expired',
] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

export class InvitesQueryDto {
    @ApiPropertyOptional({
        description: 'Фильтр по статусу кода',
        type: String,
        enum: INVITE_STATUSES,
        example: 'issued',
    })
    @IsOptional()
    @IsString()
    @MaxLength(32)
    status?: string;

    @ApiPropertyOptional({
        description: 'Фильтр по email получателя (частичное совпадение)',
        type: String,
        example: 'director@romashka.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    email?: string;
}

export class IssueInviteDto {
    @ApiProperty({
        description: 'Email получателя кода подключения',
        type: String,
        example: 'director@romashka.ru',
    })
    @IsEmail({}, { message: 'Некорректный email получателя' })
    @MaxLength(255)
    email!: string;

    @ApiPropertyOptional({
        description:
            'Название организации клиента (попадёт в письмо и в карточку клиента)',
        type: String,
        example: 'ООО «Ромашка»',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    organization?: string;

    @ApiPropertyOptional({
        description: 'Код продукта, к которому подключается портал',
        type: String,
        example: 'sales',
        default: 'sales',
    })
    @IsOptional()
    @IsString()
    @MaxLength(64)
    productCode?: string;

    @ApiPropertyOptional({
        description: 'Срок действия кода в днях (1–90, по умолчанию 14)',
        type: Number,
        example: 14,
        default: 14,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(90)
    ttlDays?: number;

    @ApiPropertyOptional({
        description:
            'Ставить продукт сразу при погашении кода (true) или сначала показать мастер вопросов (false). ' +
            'Если не передано — берётся глобальный дефолт из env MARKETPLACE_INVITE_AUTO_PROVISION.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    autoProvision?: boolean;

    @ApiPropertyOptional({
        description: 'Служебная заметка модератора (клиенту не показывается)',
        type: String,
        example: 'Выдан по заявке с сайта от 20.07.2026',
    })
    @IsOptional()
    @IsString()
    note?: string;
}

export class ReissueInviteDto {
    @ApiPropertyOptional({
        description:
            'Новый email получателя. Если не передан — код уйдёт на адрес исходного invite.',
        type: String,
        example: 'new-director@romashka.ru',
    })
    @IsOptional()
    @IsEmail({}, { message: 'Некорректный email получателя' })
    @MaxLength(255)
    email?: string;

    @ApiPropertyOptional({
        description: 'Срок действия нового кода в днях (1–90, по умолчанию 14)',
        type: Number,
        example: 14,
        default: 14,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(90)
    ttlDays?: number;

    @ApiPropertyOptional({
        description: 'Причина перевыпуска (пишется в заметку нового кода)',
        type: String,
        example: 'Клиент потерял письмо',
    })
    @IsOptional()
    @IsString()
    note?: string;
}

/** Карточка кода подключения БЕЗ самого кода и без хэша */
export class InviteDto {
    @ApiProperty({
        description: 'ID кода подключения (uuid)',
        type: String,
        example: 'a3f1c2d0-9b8e-4a1c-8f2d-1e5b7c9d0a11',
    })
    id!: string;

    @ApiProperty({
        description:
            'Видимая часть кода для опознания в списке (сам код не хранится)',
        type: String,
        example: 'GRNT-AB12',
    })
    codePrefix!: string;

    @ApiProperty({
        description: 'Email получателя',
        type: String,
        example: 'director@romashka.ru',
    })
    email!: string;

    @ApiPropertyOptional({
        description: 'Организация клиента',
        type: String,
        example: 'ООО «Ромашка»',
    })
    organization?: string;

    @ApiProperty({
        description: 'Код продукта',
        type: String,
        example: 'sales',
    })
    productCode!: string;

    @ApiProperty({
        description:
            'Ставить продукт сразу при погашении (иначе — мастер вопросов)',
        type: Boolean,
        example: true,
    })
    autoProvision!: boolean;

    @ApiProperty({
        description: 'Статус кода',
        type: String,
        enum: INVITE_STATUSES,
        example: 'sent',
    })
    status!: string;

    @ApiPropertyOptional({
        description: 'Когда выпущен',
        type: String,
        example: '2026-07-20T10:00:00.000Z',
    })
    createdAt?: string;

    @ApiPropertyOptional({
        description: 'Действителен до',
        type: String,
        example: '2026-08-03T10:00:00.000Z',
    })
    expiresAt?: string;

    @ApiPropertyOptional({
        description: 'Когда письмо с кодом ушло получателю',
        type: String,
        example: '2026-07-20T10:00:02.000Z',
    })
    sentAt?: string;

    @ApiPropertyOptional({
        description: 'Когда код погашен на портале',
        type: String,
        example: '2026-07-21T08:15:00.000Z',
    })
    redeemedAt?: string;

    @ApiPropertyOptional({
        description: 'Когда код отозван',
        type: String,
        example: '2026-07-25T12:00:00.000Z',
    })
    revokedAt?: string;

    @ApiPropertyOptional({
        description: 'Логин супер-пользователя, выпустившего код',
        type: String,
        example: 'admin',
    })
    issuedBy?: string;

    @ApiPropertyOptional({
        description: 'Логин супер-пользователя, отозвавшего код',
        type: String,
        example: 'admin',
    })
    revokedBy?: string;

    @ApiPropertyOptional({
        description: 'ID портала, погасившего код',
        type: String,
        example: '7',
    })
    redeemedPortalId?: string;

    @ApiPropertyOptional({
        description: 'Домен портала, погасившего код',
        type: String,
        example: 'romashka.bitrix24.ru',
    })
    redeemedPortalDomain?: string;

    @ApiPropertyOptional({
        description: 'Служебная заметка модератора',
        type: String,
        example: 'Выдан по заявке с сайта от 20.07.2026',
    })
    note?: string;
}

/**
 * Результат выпуска/перевыпуска кода.
 * ЕДИНСТВЕННОЕ место, где открытый код возвращается наружу.
 */
export class IssuedInviteDto extends InviteDto {
    @ApiProperty({
        description:
            'Код подключения открытым текстом. Показывается ОДИН РАЗ — в БД хранится только хэш.',
        type: String,
        example: 'GRNT-AB12-CD34',
    })
    code!: string;

    @ApiProperty({
        description:
            'Письмо с кодом успешно отправлено. Если false — передайте код клиенту вручную.',
        type: Boolean,
        example: true,
    })
    emailSent!: boolean;
}
