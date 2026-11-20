import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    DEAL_MOVEMENT_ALARM_STATUSES,
    DEAL_MOVEMENT_LIMIT_SOURCES,
    type DealMovementAlarmStatus,
    type DealMovementLimitSource,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsEnvelopeDto } from '../../dto/ai-response-envelope.dto';

const STATUS_DESCRIPTION =
    'Код статуса: rolled_back — «Вернулась назад», abandoned — «Без ' +
    'внимания», stuck — «Без продвижения», at_risk — «Под риском».';

/** Строка списка проблемных сделок. */
export class DealMovementDealItemDto {
    @ApiProperty({
        description: 'Id сделки в Битриксе.',
        type: String,
        example: '9041',
    })
    dealId: string;

    @ApiProperty({
        description: 'Ссылка на карточку сделки в Битриксе.',
        type: String,
        example: 'https://april.bitrix24.ru/crm/deal/details/9041/',
    })
    url: string;

    @ApiProperty({
        description: 'Название сделки.',
        type: String,
        example: 'ООО «Ромашка» — Гарант',
    })
    title: string;

    @ApiProperty({
        description: 'Bitrix-id ответственного; null — не назначен.',
        type: String,
        nullable: true,
        example: '447',
    })
    managerId: string | null;

    @ApiProperty({
        description:
            'Имя ответственного «Фамилия Имя»; null — нет в структуре.',
        type: String,
        nullable: true,
        example: 'Иванова Анна',
    })
    managerName: string | null;

    @ApiProperty({
        description: STATUS_DESCRIPTION,
        enum: DEAL_MOVEMENT_ALARM_STATUSES,
        example: 'stuck',
    })
    status: DealMovementAlarmStatus;

    @ApiProperty({
        description: 'Подпись статуса для человека.',
        type: String,
        example: 'Без продвижения',
    })
    statusTitle: string;

    @ApiProperty({
        description: 'Сумма сделки; null — не указана.',
        type: Number,
        nullable: true,
        example: 150_000,
    })
    amount: number | null;

    @ApiProperty({
        description: 'Название стадии на портале; null — неизвестно.',
        type: String,
        nullable: true,
        example: 'Презентация',
    })
    stageTitle: string | null;

    @ApiProperty({
        description:
            'Код ступени воронки «ОП Основная»; null — стадия вне лестницы.',
        type: String,
        nullable: true,
        example: 'sales_pres',
    })
    stageCode: string | null;

    @ApiProperty({
        description: 'Дней в текущей стадии.',
        type: Number,
        example: 34,
    })
    daysInStage: number;

    @ApiProperty({
        description: 'Срок стадии, с которым сравнивали, дней.',
        type: Number,
        example: 21,
    })
    stageLimitDays: number;

    @ApiProperty({
        description:
            'Откуда срок: history — обычный срок стадии по истории портала ' +
            '(p90), default — общий порог настройки.',
        enum: DEAL_MOVEMENT_LIMIT_SOURCES,
        example: 'default',
    })
    stageLimitSource: DealMovementLimitSource;

    @ApiProperty({
        description: 'Причина статуса словами, одной строкой.',
        type: String,
        example:
            'в стадии 34 дня при пороге 21 день; ни звонков, ни дел за 14 дней',
    })
    reasons: string;

    @ApiProperty({
        description:
            'С какой ночи сделка в этом статусе (ISO 8601); null — в нём с ' +
            'первого счёта, смены при нас не было («с начала наблюдений»).',
        type: String,
        nullable: true,
        example: '2026-11-15T23:30:00.000Z',
    })
    since: string | null;
}

/** Ответственный × статус: сколько всего и сколько в списке. */
export class DealMovementDealsGroupDto {
    @ApiProperty({
        description: 'Bitrix-id ответственного; null — не назначен.',
        type: String,
        nullable: true,
        example: '447',
    })
    managerId: string | null;

    @ApiProperty({
        description: STATUS_DESCRIPTION,
        enum: DEAL_MOVEMENT_ALARM_STATUSES,
        example: 'abandoned',
    })
    status: DealMovementAlarmStatus;

    @ApiProperty({
        description: 'Сколько сделок в статусе у ответственного всего.',
        type: Number,
        example: 48,
    })
    total: number;

    @ApiProperty({
        description:
            'Сколько из них есть в списке (самые крупные по сумме, не больше perGroup).',
        type: Number,
        example: 30,
    })
    shown: number;
}

/** Страница списка проблемных сделок последней ночи. */
export class DealMovementDealsPageDto {
    @ApiProperty({
        description:
            'Ночь списка (YYYY-MM-DD); null — списка ещё нет (см. note).',
        type: String,
        nullable: true,
        example: '2026-11-20',
    })
    day: string | null;

    @ApiProperty({
        description: 'Когда посчитан список (ISO 8601); null — списка нет.',
        type: String,
        nullable: true,
        example: '2026-11-19T23:41:00.000Z',
    })
    generatedAt: string | null;

    @ApiProperty({
        description: 'Строки страницы — по убыванию суммы.',
        type: [DealMovementDealItemDto],
    })
    items: DealMovementDealItemDto[];

    @ApiProperty({
        description: 'Строк в списке после фильтров (все страницы).',
        type: Number,
        example: 74,
    })
    total: number;

    @ApiProperty({ description: 'Номер страницы.', type: Number, example: 1 })
    page: number;

    @ApiProperty({
        description: 'Строк на странице.',
        type: Number,
        example: 25,
    })
    pageSize: number;

    @ApiProperty({
        description:
            'Предел строк на ответственного и статус: в список попадают ' +
            'только самые крупные по сумме.',
        type: Number,
        example: 30,
    })
    perGroup: number;

    @ApiProperty({
        description:
            'Группы ответственный × статус после фильтров: где total > shown, ' +
            'показаны не все — «показаны 30 из 48».',
        type: [DealMovementDealsGroupDto],
    })
    groups: DealMovementDealsGroupDto[];

    @ApiProperty({
        description: 'Хотя бы в одной группе показаны не все сделки.',
        type: Boolean,
        example: true,
    })
    limited: boolean;

    @ApiProperty({
        description: 'Пояснение для человека; null — без пояснений.',
        type: String,
        nullable: true,
        example: null,
    })
    note: string | null;
}

/** Конверт ответа списка. */
export class DealMovementDealsResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Страница при status = ready.',
        type: DealMovementDealsPageDto,
    })
    data?: DealMovementDealsPageDto;
}
