import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { AdminFacetValueDto } from '../../admin-list/admin-facet.dto';

/** Пределы страницы списка транскрипций админки. */
export const TRANSCRIPTION_ADMIN_PAGE = {
    defaultPageSize: 50,
    maxPageSize: 200,
} as const;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Запрос страницы транскрипций: номер, размер и фильтры. Все фильтры
 * применяются на сервере — список не тянет все записи в браузер.
 */
export class TranscriptionAdminPageQueryDto {
    @ApiPropertyOptional({
        description: 'Номер страницы, начиная с 1.',
        type: Number,
        example: 1,
        minimum: 1,
        default: 1,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({
        description: `Записей на странице (1–${TRANSCRIPTION_ADMIN_PAGE.maxPageSize}).`,
        type: Number,
        example: TRANSCRIPTION_ADMIN_PAGE.defaultPageSize,
        minimum: 1,
        maximum: TRANSCRIPTION_ADMIN_PAGE.maxPageSize,
        default: TRANSCRIPTION_ADMIN_PAGE.defaultPageSize,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(TRANSCRIPTION_ADMIN_PAGE.maxPageSize)
    pageSize?: number;

    @ApiPropertyOptional({
        description: 'Домен портала Битрикс24 — только его транскрипции.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    domain?: string;

    @ApiPropertyOptional({
        description:
            'Распознаватель, как записан в базе: yandex, bitrix-vibecode, local-whisper.',
        type: String,
        example: 'yandex',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    provider?: string;

    @ApiPropertyOptional({
        description: 'Статус записи: queued, processing, done, error.',
        type: String,
        example: 'done',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    status?: string;

    @ApiPropertyOptional({
        description: 'Приложение, из которого пришёл звонок.',
        type: String,
        example: 'event-sales',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    app?: string;

    @ApiPropertyOptional({
        description: 'Id сотрудника в Битриксе — только его звонки.',
        type: String,
        example: '447',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    userId?: string;

    @ApiPropertyOptional({
        description:
            'Поиск по имени сотрудника, названию сущности, id сущности или id дела. По тексту разговора не ищет: это слишком медленно для общего списка.',
        type: String,
        example: 'Ромашка',
    })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    search?: string;

    @ApiPropertyOptional({
        description: 'С какого дня (по Москве, включительно), YYYY-MM-DD.',
        type: String,
        example: '2026-11-01',
    })
    @IsOptional()
    @IsString()
    @Matches(DAY_RE, { message: 'Дата — в виде YYYY-MM-DD' })
    dateFrom?: string;

    @ApiPropertyOptional({
        description: 'По какой день (по Москве, включительно), YYYY-MM-DD.',
        type: String,
        example: '2026-11-30',
    })
    @IsOptional()
    @IsString()
    @Matches(DAY_RE, { message: 'Дата — в виде YYYY-MM-DD' })
    dateTo?: string;
}

/** Строка списка транскрипций — без текста и сегментов. */
export class TranscriptionAdminListItemDto {
    @ApiProperty({
        description: 'Id транскрипции.',
        type: String,
        example: '98123',
    })
    id: string;

    @ApiProperty({
        description: 'Когда запись создана.',
        type: Date,
        nullable: true,
        example: '2026-11-12T09:41:00.000Z',
    })
    createdAt: Date | null;

    @ApiProperty({
        description: 'Когда начался звонок (телефония).',
        type: Date,
        nullable: true,
        example: '2026-11-12T09:20:00.000Z',
    })
    callStartedAt: Date | null;

    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        nullable: true,
        example: 'april-garant.bitrix24.ru',
    })
    domain: string | null;

    @ApiProperty({
        description: 'Кто распознал звонок; пусто — ещё не распознан.',
        type: String,
        nullable: true,
        example: 'yandex',
    })
    provider: string | null;

    @ApiProperty({
        description: 'Статус записи.',
        type: String,
        nullable: true,
        example: 'done',
    })
    status: string | null;

    @ApiProperty({
        description: 'Длительность звонка, секунд; null — неизвестна.',
        type: Number,
        nullable: true,
        example: 734,
    })
    durationSec: number | null;

    @ApiProperty({
        description: 'Длина текста, символов; null — текста нет.',
        type: Number,
        nullable: true,
        example: 8120,
    })
    symbolsCount: number | null;

    @ApiProperty({
        description: 'Id сотрудника в Битриксе.',
        type: String,
        nullable: true,
        example: '447',
    })
    userId: string | null;

    @ApiProperty({
        description: 'Имя сотрудника.',
        type: String,
        nullable: true,
        example: 'Иванова Мария',
    })
    userName: string | null;

    @ApiProperty({
        description: 'Тип сущности CRM.',
        type: String,
        nullable: true,
        example: 'deal',
    })
    entityType: string | null;

    @ApiProperty({
        description: 'Id сущности CRM.',
        type: String,
        nullable: true,
        example: '217301',
    })
    entityId: string | null;

    @ApiProperty({
        description: 'Название сущности CRM.',
        type: String,
        nullable: true,
        example: 'ООО «Ромашка»',
    })
    entityName: string | null;

    @ApiProperty({
        description: 'Приложение, из которого пришёл звонок.',
        type: String,
        nullable: true,
        example: 'event-sales',
    })
    app: string | null;

    @ApiProperty({
        description: 'Отдел сотрудника.',
        type: String,
        nullable: true,
        example: 'Отдел продаж',
    })
    department: string | null;
}

/** Страница транскрипций: свежие первыми и общее число под фильтром. */
export class TranscriptionAdminPageDto {
    @ApiProperty({
        description: 'Записи страницы, свежие первыми (по id).',
        type: [TranscriptionAdminListItemDto],
    })
    items: TranscriptionAdminListItemDto[];

    @ApiProperty({
        description: 'Всего записей под фильтром.',
        type: Number,
        example: 1234,
    })
    total: number;

    @ApiProperty({ description: 'Номер страницы.', type: Number, example: 1 })
    page: number;

    @ApiProperty({
        description: 'Записей на странице.',
        type: Number,
        example: TRANSCRIPTION_ADMIN_PAGE.defaultPageSize,
    })
    pageSize: number;
}

/** Значения для фильтров списка транскрипций. */
export class TranscriptionAdminFacetsDto {
    @ApiProperty({
        description: 'Порталы: сначала с большим числом записей.',
        type: [AdminFacetValueDto],
    })
    domains: AdminFacetValueDto[];

    @ApiProperty({
        description: 'Распознаватели.',
        type: [AdminFacetValueDto],
    })
    providers: AdminFacetValueDto[];

    @ApiProperty({ description: 'Статусы.', type: [AdminFacetValueDto] })
    statuses: AdminFacetValueDto[];

    @ApiProperty({ description: 'Приложения.', type: [AdminFacetValueDto] })
    apps: AdminFacetValueDto[];
}
