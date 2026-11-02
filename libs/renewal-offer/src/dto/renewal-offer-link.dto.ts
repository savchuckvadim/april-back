import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { ERenewalOfferLinkStatus } from '../lib/renewal-offer-status.util';
import {
    RENEWAL_LINK_MAX_DAYS,
    RenewalExtraLineDto,
    RenewalOfferInputDto,
} from './renewal-offer.dto';

/** Создание персональной ссылки на предложение. */
export class CreateRenewalOfferLinkDto {
    @ApiProperty({
        description: 'Состав и цены предложения для этого клиента',
        type: RenewalOfferInputDto,
    })
    @ValidateNested()
    @Type(() => RenewalOfferInputDto)
    offer: RenewalOfferInputDto;

    @ApiPropertyOptional({
        description:
            'Служебная пометка «кому и зачем выдана». Клиент её не видит',
        type: String,
        example: 'Продление на 2027, отправлено 02.11',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    title?: string;

    @ApiPropertyOptional({
        description:
            'Срок действия в днях. Не указан — ссылка действует до отзыва',
        type: Number,
        example: 30,
        minimum: 1,
        maximum: RENEWAL_LINK_MAX_DAYS,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(RENEWAL_LINK_MAX_DAYS)
    expiresInDays?: number;
}

/** Ссылка в списке админки: со служебными полями и статистикой. */
export class RenewalOfferLinkDto {
    @ApiProperty({ description: 'Идентификатор ссылки', type: String })
    id: string;

    @ApiProperty({
        description: 'Токен: последняя часть адреса предложения',
        type: String,
    })
    token: string;

    @ApiProperty({ description: 'Название клиента', type: String })
    clientName: string;

    @ApiProperty({
        description: 'Служебная пометка о выдаче',
        type: String,
        nullable: true,
    })
    title: string | null;

    @ApiProperty({
        description: 'Месячный платёж на момент выдачи, ₽',
        type: Number,
    })
    monthlyTotal: number;

    @ApiProperty({
        description: 'Состав и цены предложения',
        type: RenewalOfferInputDto,
    })
    offer: RenewalOfferInputDto;

    @ApiProperty({
        description: 'Состояние ссылки',
        enum: ERenewalOfferLinkStatus,
        enumName: 'ERenewalOfferLinkStatus',
    })
    status: ERenewalOfferLinkStatus;

    @ApiProperty({
        description: 'Когда истекает. Пусто — действует до отзыва',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    expiresAt: string | null;

    @ApiProperty({
        description: 'Когда отозвана',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    revokedAt: string | null;

    @ApiProperty({
        description: 'Сколько раз клиент открывал предложение',
        type: Number,
    })
    viewCount: number;

    @ApiProperty({
        description: 'Когда открывали в последний раз',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    lastViewedAt: string | null;

    @ApiProperty({
        description: 'Когда создана',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    createdAt: string | null;
}

/**
 * Что отдаём публичной странице по токену. Служебных полей здесь нет:
 * ни пометки о выдаче, ни счётчика просмотров, ни идентификатора.
 */
export class PublicRenewalOfferDto {
    @ApiProperty({ description: 'Название клиента', type: String })
    clientName: string;

    @ApiProperty({
        description: 'Включён ли пакет приложений по продажам',
        type: Boolean,
    })
    salesIncluded: boolean;

    @ApiProperty({ description: 'Цена пакета приложений, ₽/мес', type: Number })
    salesPrice: number;

    @ApiProperty({ description: 'Включён ли AI-сервис', type: Boolean })
    aiIncluded: boolean;

    @ApiProperty({ description: 'Сотрудников в AI-сервисе', type: Number })
    aiEmployees: number;

    @ApiProperty({
        description: 'Базовая цена AI-сервиса, ₽/мес',
        type: Number,
    })
    aiBasePrice: number;

    @ApiProperty({
        description: 'Сколько сотрудников входит в базовую цену',
        type: Number,
    })
    aiBaseEmployees: number;

    @ApiProperty({
        description: 'Доплата за сотрудника сверх базовых, ₽/мес',
        type: Number,
    })
    aiExtraPrice: number;

    @ApiProperty({
        description: 'Коридор изменения состава без пересчёта цены, человек',
        type: Number,
    })
    aiFreeDelta: number;

    @ApiProperty({
        description: 'Включён ли персональный менеджер',
        type: Boolean,
    })
    managerIncluded: boolean;

    @ApiProperty({
        description: 'Цена персонального менеджера, ₽/мес',
        type: Number,
    })
    managerPrice: number;

    @ApiProperty({
        description: 'Показывать ли блок про часы разработки',
        type: Boolean,
    })
    devIncluded: boolean;

    @ApiProperty({
        description: 'Часов разработки в месяц в составе пакета',
        type: Number,
    })
    devHours: number;

    @ApiProperty({
        description: 'Стоимость часа разработки сверх пакета, ₽',
        type: Number,
    })
    devHourPrice: number;

    @ApiProperty({
        description: 'Скидка или надбавка, ₽. Отрицательная — скидка',
        type: Number,
    })
    adjustment: number;

    @ApiProperty({ description: 'Подпись к скидке или надбавке', type: String })
    adjustmentLabel: string;

    @ApiProperty({
        description: 'Дополнительные услуги вне прайса',
        type: [RenewalExtraLineDto],
    })
    extras: RenewalExtraLineDto[];

    @ApiProperty({
        description: 'Когда истекает предложение. Пусто — без срока',
        type: String,
        format: 'date-time',
        nullable: true,
    })
    expiresAt: string | null;
}

export class RevokeAllRenewalOfferLinksResponseDto {
    @ApiProperty({
        description: 'Сколько действующих ссылок отозвано',
        type: Number,
    })
    revoked: number;
}
