import { ApiProperty } from '@nestjs/swagger';
import type { CallListReviewsSummary } from '../calls-list.types';
import { CallsListItemBadgeDto } from './calls-list-badges.dto';
import { CallsListFacetsDto } from './calls-list-facets.dto';

/** Мой отзыв о разборе — коротко, для колонки списка. */
export class CallsListMyReviewDto {
    @ApiProperty({
        description: 'Моя оценка звонка 1–10; null — оценку не ставил.',
        type: Number,
        nullable: true,
        example: 7,
    })
    leaderScore: number | null;

    @ApiProperty({
        description: 'Согласен ли я с оценкой AI.',
        type: Boolean,
        example: true,
    })
    agree: boolean;
}

/** Отзывы руководителей о разборе звонка — сводка для строки списка. */
export class CallsListReviewsDto implements CallListReviewsSummary {
    @ApiProperty({
        description:
            'Сколько руководителей оставили отзыв (актуальные отзывы).',
        type: Number,
        example: 2,
    })
    count: number;

    @ApiProperty({
        description: 'Сколько из них не согласны с оценкой AI.',
        type: Number,
        example: 1,
    })
    disagreeCount: number;

    @ApiProperty({
        description:
            'Средняя оценка руководителей (1–10, один знак); null — оценок нет.',
        type: Number,
        nullable: true,
        example: 6.5,
    })
    avgLeaderScore: number | null;

    @ApiProperty({
        description: 'Мой отзыв; null — я отзыв не оставлял.',
        type: CallsListMyReviewDto,
        nullable: true,
    })
    mine: CallsListMyReviewDto | null;

    @ApiProperty({
        description:
            'Когда оставлен последний отзыв (ISO); null — отзывов нет.',
        type: String,
        nullable: true,
        example: '2026-11-19T08:15:00.000Z',
    })
    lastAt: string | null;
}

/** Строка списка разборов. */
export class CallsListItemDto {
    @ApiProperty({
        description: 'Номер расшифровки звонка.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Начало звонка (ISO, UTC).',
        type: String,
        example: '2026-11-18T07:42:10.000Z',
    })
    startedAt: string;

    @ApiProperty({
        description: 'Bitrix-id менеджера; null — звонок без менеджера.',
        type: String,
        nullable: true,
        example: '447',
    })
    managerId: string | null;

    @ApiProperty({
        description: 'Имя менеджера «Фамилия Имя»; null — имя не прочиталось.',
        type: String,
        nullable: true,
        example: 'Иванова Мария',
    })
    managerName: string | null;

    @ApiProperty({
        description: 'Длительность разговора, секунды; null — неизвестна.',
        type: Number,
        nullable: true,
        example: 312,
    })
    durationSec: number | null;

    @ApiProperty({
        description: 'Код типа звонка (для фильтра); null — тип не определён.',
        type: String,
        nullable: true,
        example: 'presentation',
    })
    callType: string | null;

    @ApiProperty({
        description:
            'Тип звонка словами — как на странице разбора; null — подписи нет.',
        type: String,
        nullable: true,
        example: 'Презентация',
    })
    callTypeTitle: string | null;

    @ApiProperty({
        description:
            'Оценка AI по шкале витрины (до 10, один знак); null — оценки нет.',
        type: Number,
        nullable: true,
        example: 6.4,
    })
    aiScore: number | null;

    @ApiProperty({
        description:
            'Клиент: название сделки, лида, компании или имя контакта из ' +
            'CRM; null — не прочиталось.',
        type: String,
        nullable: true,
        example: 'ООО «Ромашка»',
    })
    client: string | null;

    @ApiProperty({
        description: 'Отзывы руководителей о разборе.',
        type: CallsListReviewsDto,
    })
    reviews: CallsListReviewsDto;

    @ApiProperty({
        description:
            'Бейджи строки: проблемы звонка (общие бейджи с пометкой «проблема») ' +
            'и невыполненные основные пункты методики портала (id с приставкой «m:»).',
        type: [CallsListItemBadgeDto],
    })
    badges: CallsListItemBadgeDto[];

    @ApiProperty({
        description:
            'Адрес страницы разбора на сайте «Отчёта» — личная ссылка ' +
            'руководителя с правом на отзыв (7 дней). Обычная ссылка — если ' +
            'личную выпустить нельзя; null — ссылки нет (не настроен секрет ' +
            'или адрес сайта).',
        type: String,
        nullable: true,
        example:
            'https://next.april-app.ru/call/7wl-3q2x8Yk0mXo1p7cT5vB9nW4sZ6aQeR/lead/eyJ2IjoxfQ.abc',
    })
    url: string | null;
}

/** Страница списка разборов. */
export class CallsListResponseDto {
    @ApiProperty({
        description: 'Строки запрошенной страницы.',
        type: [CallsListItemDto],
    })
    items: CallsListItemDto[];

    @ApiProperty({
        description: 'Всего строк под фильтры (на всех страницах).',
        type: Number,
        example: 134,
    })
    total: number;

    @ApiProperty({
        description: 'Номер страницы, с 1.',
        type: Number,
        example: 1,
    })
    page: number;

    @ApiProperty({
        description: 'Строк на странице.',
        type: Number,
        example: 25,
    })
    pageSize: number;

    @ApiProperty({
        description: 'Варианты фильтров за период.',
        type: CallsListFacetsDto,
    })
    facets: CallsListFacetsDto;

    @ApiProperty({
        description:
            'Типы звонка, к которым относятся выбранные бейджи методики ' +
            '(пересечение типов выбранных пунктов; пусто — общих типов нет); ' +
            'null — выбранные бейджи типы не ограничивают.',
        type: [String],
        nullable: true,
        example: ['presentation'],
    })
    callTypesLock: string[] | null;
}
