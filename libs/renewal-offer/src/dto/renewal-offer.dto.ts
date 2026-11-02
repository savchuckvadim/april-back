import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsIn,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    RENEWAL_EXTRA_PERIODS,
    RENEWAL_LIMITS,
    RENEWAL_PRICE_DEFAULTS,
    type RenewalExtraPeriod,
} from '../lib/renewal-offer.model';

/** Самый долгий срок ссылки с датой окончания. */
export const RENEWAL_LINK_MAX_DAYS = 3650;

const { price, employees, hours, extras } = RENEWAL_LIMITS;

/** Дополнительная услуга вне прайса — строкой в предложении. */
export class RenewalExtraLineDto {
    @ApiProperty({
        description: 'Название услуги, как её увидит клиент',
        type: String,
        example: 'Телефония',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    title: string;

    @ApiProperty({
        description: 'Стоимость услуги, ₽',
        type: Number,
        example: 3000,
        minimum: price.min,
        maximum: price.max,
    })
    @IsInt()
    @Min(price.min)
    @Max(price.max)
    price: number;

    @ApiProperty({
        description:
            'Периодичность: month — входит в месячный платёж, once — разовая',
        enum: RENEWAL_EXTRA_PERIODS,
        enumName: 'ERenewalExtraPeriod',
        example: 'month',
    })
    @IsIn(RENEWAL_EXTRA_PERIODS)
    period: RenewalExtraPeriod;
}

/**
 * Состав и цены предложения. Все цены необязательны: не указана — берётся
 * из прайса по умолчанию, поэтому ссылка «как у всех» создаётся одним
 * названием клиента.
 */
export class RenewalOfferInputDto {
    @ApiProperty({
        description: 'Название клиента в шапке предложения',
        type: String,
        example: 'ООО Ромашка',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    clientName: string;

    @ApiPropertyOptional({
        description: 'Включён ли пакет приложений по продажам',
        type: Boolean,
        example: true,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    salesIncluded?: boolean;

    @ApiPropertyOptional({
        description: 'Цена пакета приложений, ₽/мес',
        type: Number,
        example: 6500,
        default: RENEWAL_PRICE_DEFAULTS.sales,
        minimum: price.min,
        maximum: price.max,
    })
    @IsOptional()
    @IsInt()
    @Min(price.min)
    @Max(price.max)
    salesPrice?: number;

    @ApiPropertyOptional({
        description: 'Включён ли AI-сервис',
        type: Boolean,
        example: true,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    aiIncluded?: boolean;

    @ApiPropertyOptional({
        description: 'Сотрудников в AI-сервисе: от этого числа считается цена',
        type: Number,
        example: 7,
        default: RENEWAL_PRICE_DEFAULTS.aiBaseEmployees,
        minimum: employees.min,
        maximum: employees.max,
    })
    @IsOptional()
    @IsInt()
    @Min(employees.min)
    @Max(employees.max)
    aiEmployees?: number;

    @ApiPropertyOptional({
        description: 'Базовая цена AI-сервиса, ₽/мес',
        type: Number,
        example: 7500,
        default: RENEWAL_PRICE_DEFAULTS.aiBase,
        minimum: price.min,
        maximum: price.max,
    })
    @IsOptional()
    @IsInt()
    @Min(price.min)
    @Max(price.max)
    aiBasePrice?: number;

    @ApiPropertyOptional({
        description: 'Сколько сотрудников входит в базовую цену',
        type: Number,
        example: 3,
        default: RENEWAL_PRICE_DEFAULTS.aiBaseEmployees,
        minimum: employees.min,
        maximum: employees.max,
    })
    @IsOptional()
    @IsInt()
    @Min(employees.min)
    @Max(employees.max)
    aiBaseEmployees?: number;

    @ApiPropertyOptional({
        description: 'Доплата за сотрудника сверх базовых, ₽/мес',
        type: Number,
        example: 1000,
        default: RENEWAL_PRICE_DEFAULTS.aiExtra,
        minimum: price.min,
        maximum: price.max,
    })
    @IsOptional()
    @IsInt()
    @Min(price.min)
    @Max(price.max)
    aiExtraPrice?: number;

    @ApiPropertyOptional({
        description:
            'Коридор изменения состава без пересчёта цены, человек (±N)',
        type: Number,
        example: 2,
        default: RENEWAL_PRICE_DEFAULTS.aiFreeDelta,
        minimum: 0,
        maximum: employees.max,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(employees.max)
    aiFreeDelta?: number;

    @ApiPropertyOptional({
        description: 'Включён ли персональный менеджер',
        type: Boolean,
        example: true,
        default: false,
    })
    @IsOptional()
    @IsBoolean()
    managerIncluded?: boolean;

    @ApiPropertyOptional({
        description: 'Цена персонального менеджера, ₽/мес',
        type: Number,
        example: 10000,
        default: RENEWAL_PRICE_DEFAULTS.manager,
        minimum: price.min,
        maximum: price.max,
    })
    @IsOptional()
    @IsInt()
    @Min(price.min)
    @Max(price.max)
    managerPrice?: number;

    @ApiPropertyOptional({
        description: 'Показывать ли блок про часы разработки',
        type: Boolean,
        example: true,
        default: true,
    })
    @IsOptional()
    @IsBoolean()
    devIncluded?: boolean;

    @ApiPropertyOptional({
        description: 'Часов разработки в месяц в составе пакета',
        type: Number,
        example: 30,
        default: RENEWAL_PRICE_DEFAULTS.devHours,
        minimum: hours.min,
        maximum: hours.max,
    })
    @IsOptional()
    @IsInt()
    @Min(hours.min)
    @Max(hours.max)
    devHours?: number;

    @ApiPropertyOptional({
        description: 'Стоимость часа разработки сверх пакета, ₽',
        type: Number,
        example: 2000,
        default: RENEWAL_PRICE_DEFAULTS.devHour,
        minimum: price.min,
        maximum: price.max,
    })
    @IsOptional()
    @IsInt()
    @Min(price.min)
    @Max(price.max)
    devHourPrice?: number;

    @ApiPropertyOptional({
        description:
            'Скидка или надбавка к месячному платежу, ₽. Отрицательная — скидка',
        type: Number,
        example: -2000,
        default: 0,
        minimum: -price.max,
        maximum: price.max,
    })
    @IsOptional()
    @IsInt()
    @Min(-price.max)
    @Max(price.max)
    adjustment?: number;

    @ApiPropertyOptional({
        description: 'Подпись к скидке или надбавке',
        type: String,
        example: 'Скидка за год вперёд',
        default: 'Скидка',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    adjustmentLabel?: string;

    @ApiPropertyOptional({
        description: 'Дополнительные услуги вне прайса, строками',
        type: [RenewalExtraLineDto],
        maxItems: extras.max,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => RenewalExtraLineDto)
    extras?: RenewalExtraLineDto[];
}
