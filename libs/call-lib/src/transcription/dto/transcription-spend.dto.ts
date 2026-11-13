import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import {
    TRANSCRIPTION_SPEND_PROVIDERS,
    type SpendByProvider,
    type SpendTotals,
    type TranscriptionSpendProvider,
} from '../lib/transcription-spend.util';

/** Запрос расхода: месяц по Москве. */
export class TranscriptionSpendQueryDto {
    @ApiPropertyOptional({
        description:
            'Месяц по Москве в виде YYYY-MM. Не задан — текущий месяц.',
        type: String,
        example: '2026-11',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
        message: 'Месяц — в виде YYYY-MM, например 2026-11',
    })
    month?: string;
}

/** Расход по одному распознавателю. */
export class TranscriptionSpendProviderDto implements SpendByProvider {
    @ApiProperty({
        description:
            'Распознаватель: yandex — Yandex SpeechKit (платный), vibecode — VibeCode, whisper — свой Whisper, other — прочие записи.',
        type: String,
        enum: TRANSCRIPTION_SPEND_PROVIDERS,
        example: 'yandex',
    })
    provider: TranscriptionSpendProvider;

    @ApiProperty({
        description: 'Название распознавателя для показа.',
        type: String,
        example: 'Яндекс',
    })
    label: string;

    @ApiProperty({
        description: 'Платный ли распознаватель: деньги идут только Яндексу.',
        type: Boolean,
        example: true,
    })
    paid: boolean;

    @ApiProperty({
        description: 'Сколько звонков распознано.',
        type: Number,
        example: 412,
    })
    calls: number;

    @ApiProperty({
        description:
            'Сумма длительностей звонков, минут (один знак после запятой).',
        type: Number,
        example: 5320.4,
    })
    minutes: number;

    @ApiProperty({
        description:
            'Оплачиваемые минуты: звонок короче 15 секунд — как 15 секунд. У бесплатных распознавателей — 0.',
        type: Number,
        example: 5331.2,
    })
    billedMinutes: number;

    @ApiProperty({
        description:
            'Расход в рублях по цене минуты из «Настроек приложения». У бесплатных распознавателей — 0.',
        type: Number,
        example: 3198.72,
    })
    rub: number;

    @ApiProperty({
        description:
            'Звонков без длительности: в минуты и рубли не попали, расход по ним занижен.',
        type: Number,
        example: 0,
    })
    unknownDurationCalls: number;
}

/** Итог среза: все распознаватели и отдельно Яндекс. */
export class TranscriptionSpendTotalsDto implements SpendTotals {
    @ApiProperty({
        description: 'Всего распознанных звонков.',
        type: Number,
        example: 1250,
    })
    calls: number;

    @ApiProperty({
        description: 'Всего минут записей, всеми распознавателями.',
        type: Number,
        example: 9800.5,
    })
    minutes: number;

    @ApiProperty({
        description: 'Расход в рублях (только Яндекс).',
        type: Number,
        example: 3198.72,
    })
    rub: number;

    @ApiProperty({
        description: 'Звонков, распознанных Яндексом.',
        type: Number,
        example: 412,
    })
    yandexCalls: number;

    @ApiProperty({
        description: 'Минут записей, распознанных Яндексом.',
        type: Number,
        example: 5320.4,
    })
    yandexMinutes: number;

    @ApiProperty({
        description: 'Звонков без длительности во всём срезе.',
        type: Number,
        example: 0,
    })
    unknownDurationCalls: number;
}

/** Строка сводки: один портал за месяц. */
export class TranscriptionSpendPortalRowDto {
    @ApiProperty({
        description: 'Домен портала Битрикс24.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description:
            'Id портала в админке — для ссылки на карточку; null, если портал с таким доменом не заведён.',
        type: Number,
        nullable: true,
        example: 1,
    })
    portalId: number | null;

    @ApiProperty({
        description: 'Итог портала за месяц.',
        type: TranscriptionSpendTotalsDto,
    })
    totals: TranscriptionSpendTotalsDto;

    @ApiProperty({
        description: 'Расход портала по распознавателям.',
        type: [TranscriptionSpendProviderDto],
    })
    providers: TranscriptionSpendProviderDto[];
}

/** Сводка расхода по всем порталам за месяц. */
export class TranscriptionSpendSummaryDto {
    @ApiProperty({
        description: 'Месяц по Москве, YYYY-MM.',
        type: String,
        example: '2026-11',
    })
    month: string;

    @ApiProperty({
        description:
            'Цена минуты Яндекса в копейках, по которой посчитаны рубли.',
        type: Number,
        example: 60,
    })
    kopecksPerMinute: number;

    @ApiProperty({
        description: 'Итог по всем порталам.',
        type: TranscriptionSpendTotalsDto,
    })
    totals: TranscriptionSpendTotalsDto;

    @ApiProperty({
        description: 'Порталы: сначала самые дорогие, затем по числу звонков.',
        type: [TranscriptionSpendPortalRowDto],
    })
    portals: TranscriptionSpendPortalRowDto[];
}

/** Расход портала за один день. */
export class TranscriptionSpendDayDto {
    @ApiProperty({
        description: 'День по Москве, YYYY-MM-DD.',
        type: String,
        example: '2026-11-12',
    })
    day: string;

    @ApiProperty({
        description: 'Итог дня.',
        type: TranscriptionSpendTotalsDto,
    })
    totals: TranscriptionSpendTotalsDto;
}

/** Расход портала по одному сотруднику. */
export class TranscriptionSpendUserDto {
    @ApiProperty({
        description: 'Id сотрудника в Битриксе; null — звонок без сотрудника.',
        type: String,
        nullable: true,
        example: '447',
    })
    userId: string | null;

    @ApiProperty({
        description: 'Имя сотрудника, как записано при распознавании.',
        type: String,
        nullable: true,
        example: 'Иванова Мария',
    })
    userName: string | null;

    @ApiProperty({
        description: 'Итог сотрудника за месяц.',
        type: TranscriptionSpendTotalsDto,
    })
    totals: TranscriptionSpendTotalsDto;
}

/** Звонок, распознанный Яндексом, — из самых длинных за месяц. */
export class TranscriptionSpendCallDto {
    @ApiProperty({
        description: 'Id транскрибации — для перехода к тексту.',
        type: String,
        example: '98123',
    })
    id: string;

    @ApiProperty({
        description: 'Когда звонок распознан.',
        type: Date,
        nullable: true,
        example: '2026-11-12T09:41:00.000Z',
    })
    createdAt: Date | null;

    @ApiProperty({
        description: 'Длительность звонка, секунд.',
        type: Number,
        example: 2140,
    })
    durationSec: number;

    @ApiProperty({
        description: 'Расход на этот звонок, рублей.',
        type: Number,
        example: 21.4,
    })
    rub: number;

    @ApiProperty({
        description: 'Сотрудник.',
        type: String,
        nullable: true,
        example: 'Иванова Мария',
    })
    userName: string | null;

    @ApiProperty({
        description: 'Тип сущности CRM, к которой привязан звонок.',
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
}

/** Расход одного портала за месяц: по распознавателям, дням, сотрудникам. */
export class TranscriptionSpendPortalDto {
    @ApiProperty({
        description: 'Месяц по Москве, YYYY-MM.',
        type: String,
        example: '2026-11',
    })
    month: string;

    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Цена минуты Яндекса в копейках.',
        type: Number,
        example: 60,
    })
    kopecksPerMinute: number;

    @ApiProperty({
        description: 'Итог портала за месяц.',
        type: TranscriptionSpendTotalsDto,
    })
    totals: TranscriptionSpendTotalsDto;

    @ApiProperty({
        description: 'Итог портала за предыдущий месяц — для сравнения.',
        type: TranscriptionSpendTotalsDto,
    })
    previousTotals: TranscriptionSpendTotalsDto;

    @ApiProperty({
        description: 'Расход по распознавателям.',
        type: [TranscriptionSpendProviderDto],
    })
    providers: TranscriptionSpendProviderDto[];

    @ApiProperty({
        description:
            'Расход по дням месяца, по порядку; дни без звонков не показываются.',
        type: [TranscriptionSpendDayDto],
    })
    days: TranscriptionSpendDayDto[];

    @ApiProperty({
        description: 'Расход по сотрудникам: сначала самые дорогие.',
        type: [TranscriptionSpendUserDto],
    })
    users: TranscriptionSpendUserDto[];

    @ApiProperty({
        description: 'Самые длинные звонки месяца, распознанные Яндексом.',
        type: [TranscriptionSpendCallDto],
    })
    topCalls: TranscriptionSpendCallDto[];
}
