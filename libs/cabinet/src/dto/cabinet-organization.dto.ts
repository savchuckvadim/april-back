import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import type {
    CabinetOrganizationOverview,
    CabinetOrganizationOwner,
    CabinetOrganizationPerson,
    CabinetOrganizationPersonPortal,
    CabinetOrganizationPortal,
} from '../admin/cabinet-organization.view';

/** Пустая строка email из формы — «без email». */
const emptyToNull = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' && !value.trim() ? null : value;

export class CabinetCreateClientDto {
    @ApiProperty({
        description: 'Название организации-клиента.',
        type: String,
        example: 'Альфа-Центр',
    })
    @IsString()
    @IsNotEmpty({ message: 'Укажите название организации' })
    @MaxLength(255)
    name!: string;

    @ApiProperty({
        description:
            'Email организации — уникален на всю базу; пусто — без email (можно добавить позже в карточке клиента).',
        type: String,
        nullable: true,
        required: false,
        example: 'director@alfacentr.ru',
    })
    @Transform(emptyToNull)
    @IsOptional()
    @IsEmail({}, { message: 'Email вида name@example.ru или пусто' })
    @MaxLength(255)
    email?: string | null;
}

export class CabinetOrganizationOwnerDto implements CabinetOrganizationOwner {
    @ApiProperty({
        description: 'Фамилия и имя владельца.',
        type: String,
        example: 'Иванов Пётр',
    })
    name!: string;

    @ApiProperty({
        description: 'Email учётки владельца.',
        type: String,
        nullable: true,
        example: 'ivanov@alfacentr.ru',
    })
    email!: string | null;

    @ApiProperty({
        description: 'Пароль задан — владелец может входить на сайте кабинета.',
        type: Boolean,
        example: false,
    })
    hasPassword!: boolean;
}

export class CabinetOrganizationPortalDto implements CabinetOrganizationPortal {
    @ApiProperty({ description: 'ID портала.', type: Number, example: 12 })
    portalId!: number;

    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        nullable: true,
        example: 'alfacentr.bitrix24.ru',
    })
    domain!: string | null;

    @ApiProperty({
        description:
            'Допуск портала (approved, pending, blocked); null — действующий без допуска.',
        type: String,
        nullable: true,
        example: 'approved',
    })
    approvalStatus!: string | null;

    @ApiProperty({
        description: 'Приложение April установлено на портале.',
        type: Boolean,
        example: true,
    })
    appInstalled!: boolean;

    @ApiProperty({
        description: 'Чем бэкенд ходит в портал: webhook, app или auto.',
        type: String,
        example: 'webhook',
    })
    bitrixAuthMode!: string;

    @ApiProperty({
        description: 'Владелец кабинета портала; null — не назначен.',
        type: CabinetOrganizationOwnerDto,
        nullable: true,
    })
    owner!: CabinetOrganizationOwnerDto | null;

    @ApiProperty({
        description: 'Действующие участники кабинета вместе с владельцем.',
        type: Number,
        example: 3,
    })
    members!: number;

    @ApiProperty({
        description: 'Заявки на доступ, ждут подтверждения.',
        type: Number,
        example: 1,
    })
    pending!: number;

    @ApiProperty({
        description: 'Привязанные Telegram-чаты.',
        type: Number,
        example: 2,
    })
    telegram!: number;
}

export class CabinetOrganizationPersonPortalDto
    implements CabinetOrganizationPersonPortal
{
    @ApiProperty({ description: 'ID портала.', type: Number, example: 12 })
    portalId!: number;

    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        nullable: true,
        example: 'alfacentr.bitrix24.ru',
    })
    domain!: string | null;

    @ApiProperty({
        description: 'Роль: owner — владелец, member — участник.',
        type: String,
        example: 'owner',
    })
    role!: string;
}

export class CabinetOrganizationPersonDto implements CabinetOrganizationPerson {
    @ApiProperty({
        description: 'ID учётки (users.id).',
        type: Number,
        example: 41,
    })
    userId!: number;

    @ApiProperty({
        description: 'Фамилия и имя (или email, если имени нет).',
        type: String,
        example: 'Иванов Пётр',
    })
    name!: string;

    @ApiProperty({
        description: 'Email учётки.',
        type: String,
        nullable: true,
        example: 'ivanov@alfacentr.ru',
    })
    email!: string | null;

    @ApiProperty({
        description: 'Пароль задан — может входить на сайте кабинета.',
        type: Boolean,
        example: true,
    })
    hasPassword!: boolean;

    @ApiProperty({
        description: 'Порталы, к кабинету которых у человека доступ.',
        type: [CabinetOrganizationPersonPortalDto],
    })
    portals!: CabinetOrganizationPersonPortalDto[];
}

export class CabinetOrganizationOverviewDto
    implements CabinetOrganizationOverview
{
    @ApiProperty({
        description: 'ID организации-клиента.',
        type: Number,
        example: 6,
    })
    clientId!: number;

    @ApiProperty({
        description: 'Название организации.',
        type: String,
        example: 'Альфа-Центр',
    })
    name!: string;

    @ApiProperty({
        description: 'Email организации.',
        type: String,
        nullable: true,
        example: 'director@alfacentr.ru',
    })
    email!: string | null;

    @ApiProperty({
        description: 'Статус организации (active, pending…).',
        type: String,
        nullable: true,
        example: 'active',
    })
    status!: string | null;

    @ApiProperty({
        description: 'Организация действует.',
        type: Boolean,
        example: true,
    })
    isActive!: boolean;

    @ApiProperty({
        description: 'Порталы организации.',
        type: [CabinetOrganizationPortalDto],
    })
    portals!: CabinetOrganizationPortalDto[];

    @ApiProperty({
        description: 'Люди с доступом к кабинетам порталов организации.',
        type: [CabinetOrganizationPersonDto],
    })
    people!: CabinetOrganizationPersonDto[];
}
