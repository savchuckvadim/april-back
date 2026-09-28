import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_BRIEF_BULLET_GROUPS,
    type AiBriefBulletGroup,
} from '@lib/sales-ai-analytics';

/**
 * Части AI-резюме периода (план §5.2, версия 2 «что изменилось и что
 * делать»): буллет с группой, ссылкой и изменением, расход вызова
 * модели, прошлый период сравнения. Вынесены из `ai-brief.dto.ts` по
 * лимиту 300 строк; тот файл реэкспортирует их для прежних импортов.
 * Ответные DTO: валидаторов нет, только документация Swagger.
 */

/** Буллет резюме: группа, текст, адресат, ссылка, изменение и факты пакета. */
export class AiBriefBulletDto {
    @ApiProperty({
        description:
            'Текст буллета, не длиннее 30 слов; каждое число — из пакета ' +
            'фактов (значение, прошлый период, изменение, норма или план).',
        type: String,
        example:
            'Сигналов риска за период: 68 — вдвое больше, чем за прошлый ' +
            'период (31)',
    })
    text: string;

    @ApiProperty({
        description:
            'Группа пункта: change — что изменилось, focus — на кого ' +
            'смотреть, action — что сделать. Витрина показывает группы ' +
            'в этом порядке; пункты приходят уже сгруппированными.',
        enum: AI_BRIEF_BULLET_GROUPS,
        example: 'change',
    })
    group: AiBriefBulletGroup;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера пункта; нет — пункт про отдел. У пунктов ' +
            'фокуса заполнен всегда: в тексте имени нет, имя по id ' +
            'подставляет витрина.',
        type: String,
        example: '512',
    })
    managerId?: string;

    @ApiPropertyOptional({
        description: 'Код AI-типа звонка, если буллет про тип.',
        type: String,
        example: 'call',
    })
    callType?: string;

    @ApiProperty({
        description:
            'Ссылка на карточку разбора звонка или раздел витрины; ' +
            'null — ссылки нет.',
        type: String,
        nullable: true,
        example: 'https://april.bitrix24.ru/crm/type/1036/details/128/',
    })
    link: string | null;

    @ApiProperty({
        description:
            'Изменение к прошлому периоду в единицах факта (штуки, доля ' +
            '0–1, рубли): значение минус прошлое значение. Заполнено ' +
            'только у пунктов группы change со сравнённым фактом; ' +
            'null — сравнения нет.',
        type: Number,
        nullable: true,
        example: 37,
    })
    delta: number | null;

    @ApiProperty({
        description:
            'Коды фактов пакета, на которых стоит пункт (alerts, ' +
            'funnel_gap, discipline_next_step, focus_1, …). Пусто только ' +
            'у двух служебных пунктов без чисел: «сравнения с прошлым ' +
            'периодом нет» и «отдельных действий не требуется».',
        type: [String],
        example: ['alerts'],
    })
    factRefs: string[];
}

/** Расход вызова модели: токены, цена и признак оценки. */
export class AiBriefUsageDto {
    @ApiProperty({
        description:
            'Токенов вызова; null — нейросеть не вызывали (резюме по шаблону).',
        type: Number,
        nullable: true,
        example: 1240,
    })
    tokens: number | null;

    @ApiProperty({
        description:
            'Стоимость вызова, ₽ = токены / 1000 × llm_price_per_1k; ' +
            'null — модель не вызывали.',
        type: Number,
        nullable: true,
        example: 1.86,
    })
    price: number | null;

    @ApiProperty({
        description:
            'Токены и цена — оценка: провайдер не вернул usage (считали по ' +
            'длине текста) либо цена 1 000 токенов не задана (0 в реестре).',
        type: Boolean,
        example: false,
    })
    estimated: boolean;
}

/** Прошлый период сравнения той же длины, примыкающий к периоду резюме. */
export class AiBriefPreviousPeriodDto {
    @ApiProperty({
        description:
            'Начало прошлого периода (YYYY-MM-DD, TZ портала), включительно.',
        type: String,
        example: '2026-08-25',
    })
    from: string;

    @ApiProperty({
        description:
            'Конец прошлого периода (YYYY-MM-DD, TZ портала) — день перед ' +
            'началом периода резюме.',
        type: String,
        example: '2026-08-31',
    })
    to: string;
}
