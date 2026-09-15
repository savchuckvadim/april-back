import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

/** Больше за один ручной прогон писать незачем — это отладка, не миграция. */
const MAX_DEALS_PER_MANUAL_RUN = 1000;
/** Точечный прогон: столько сделок хватает, чтобы проверить гипотезу. */
const MAX_DEAL_IDS = 50;

/**
 * Запрос ручного прогона аудита сделок.
 *
 * Ручка нужна для обкатки: посмотреть, кого крон пометит забытым, ДО
 * того как включать запись и рассылку на портале.
 */
export class DealAuditRunRequestDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix, по которому считаем аудит. Настройки ' +
            'порогов и получателей берутся из админки этого портала.',
        type: String,
        example: 'example.bitrix24.ru',
    })
    @IsString()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Холостой ход: посчитать признаки, но НЕ писать их в карточки ' +
            'и не рассылать сводки. Не указан — берётся настройка портала ' +
            '«Аудит сделок: только считать».',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    dryRun?: boolean;

    @ApiPropertyOptional({
        description:
            'Максимум карточек, размечаемых за этот прогон. Подсчёт всегда ' +
            'идёт по всей воронке — лимит режет только запись.',
        type: Number,
        minimum: 1,
        maximum: MAX_DEALS_PER_MANUAL_RUN,
        example: 50,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_DEALS_PER_MANUAL_RUN)
    maxDeals?: number;

    @ApiPropertyOptional({
        description:
            'Проверить только эти сделки (Bitrix ID). Удобно для разбора ' +
            'конкретной жалобы «почему эта сделка помечена забытой».',
        type: [Number],
        example: [1234, 5678],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(MAX_DEAL_IDS)
    @Type(() => Number)
    @IsInt({ each: true })
    @Min(1, { each: true })
    dealIds?: number[];
}
