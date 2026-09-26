import { ApiProperty } from '@nestjs/swagger';
import { MetricDto } from './metric.dto';

/**
 * Разделы досье менеджера, которых нет в других DTO витрины (план Фазы 3,
 * П4): паспорт, ряды недель и месяцев, своды обратной связи и меток
 * руководителя, подписи причин и служебный блок.
 *
 * Отдельный файл — правило «класс/файл не длиннее 300 строк»: в
 * `ai-dossier.dto.ts` остаются запрос, само досье и конверт ответа
 * (образец деления — `ai-daily-plan-parts.dto.ts`).
 */

/** Причина, по которой раздел досье пришёл пустым: код секции и текст. */
export class AiDossierReasonDto {
    @ApiProperty({
        description:
            'Код раздела: passport, series, trends, planFact, yoy, style, ' +
            'objections, feedbackSummary, ropMarks, readiness.',
        type: String,
        example: 'trends',
    })
    section: string;

    @ApiProperty({
        description:
            'Код причины: no-snapshots — снапшотов раздела за окно нет; ' +
            'no-history — месяца год назад нет; too-few-data — данных ' +
            'меньше порога показа; section-failed — источник ответил ' +
            'ошибкой; style-opt-out — сотрудник отказался от профиля.',
        type: String,
        example: 'no-history',
    })
    reason: string;

    @ApiProperty({
        description: 'Подпись причины для карточки руководителя.',
        type: String,
        example:
            'За окно досье нет рассчитанных снапшотов этого раздела: ночной ' +
            'конвейер их ещё не сделал',
    })
    text: string;
}

/** Паспорт менеджера в досье: стаж, статус, уровень и источники. */
export class AiDossierPassportDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description: 'Начало стажа YYYY-MM-DD; null — определить не удалось.',
        type: String,
        nullable: true,
        example: '2025-04-01',
    })
    since: string | null;

    @ApiProperty({
        description:
            'Откуда взята дата стажа: приём, регистрация или первое ' +
            'событие (прокси); null — источника нет.',
        type: String,
        nullable: true,
        example: 'employment-date',
    })
    sinceSource: string | null;

    @ApiProperty({
        description: 'Статус сотрудника на портале; null — неизвестен.',
        type: String,
        nullable: true,
        example: 'active',
    })
    status: string | null;

    @ApiProperty({
        description: 'Дата ухода YYYY-MM-DD; null — работает.',
        type: String,
        nullable: true,
        example: '2026-08-31',
    })
    leftAt: string | null;

    @ApiProperty({
        description: 'Уровень менеджера; null — не назначен.',
        type: String,
        nullable: true,
        example: 'middle',
    })
    level: string | null;

    @ApiProperty({
        description: 'Стаж в месяцах; null — не считается без даты начала.',
        type: Number,
        nullable: true,
        example: 17,
    })
    tenureMonths: number | null;

    @ApiProperty({
        description: 'Полоса стажа (tenure_gates); null — не определена.',
        type: String,
        nullable: true,
        example: 'experienced',
    })
    tenureBand: string | null;
}

/** Точка ряда досье: период, объём разборов и средняя оценка. */
export class AiDossierSeriesPointDto {
    @ApiProperty({
        description: 'Ключ периода: YYYY-Www для недели, YYYY-MM для месяца.',
        type: String,
        example: '2026-W36',
    })
    periodKey: string;

    @ApiProperty({
        description: 'Разобранных сравнимых звонков периода.',
        type: Number,
        example: 14,
    })
    n: number;

    @ApiProperty({
        description:
            'Средняя оценка периода, шкала 1–10; value null при «мало ' +
            'данных» (n ниже порога реестра).',
        type: MetricDto,
    })
    score: MetricDto;
}

/** Ряды досье: недели и месяцы по возрастанию ключа периода. */
export class AiDossierSeriesDto {
    @ApiProperty({
        description: 'Недели окна по возрастанию (снапшоты manager-week).',
        type: [AiDossierSeriesPointDto],
    })
    weeks: AiDossierSeriesPointDto[];

    @ApiProperty({
        description: 'Месяцы окна по возрастанию (снапшоты manager-month).',
        type: [AiDossierSeriesPointDto],
    })
    months: AiDossierSeriesPointDto[];
}

/** Свод обратной связи по менеджеру за окно: реакции по видам. */
export class AiDossierFeedbackSummaryDto {
    @ApiProperty({
        description: 'Реакций всего за окно.',
        type: Number,
        example: 12,
    })
    total: number;

    @ApiProperty({
        description:
            'Счётчики по видам реакции (useful, not_useful, disagree, ' +
            'view, alert_handled …): код вида → число.',
        type: Object,
        example: { useful: 7, not_useful: 2, disagree: 3 },
    })
    byKind: Record<string, number>;
}

/** Свод меток руководителя по звонкам менеджера за окно. */
export class AiDossierRopMarksDto {
    @ApiProperty({
        description: 'Меток руководителя за окно.',
        type: Number,
        example: 5,
    })
    total: number;

    @ApiProperty({
        description: 'Из них меток «согласен с оценкой AI».',
        type: Number,
        example: 4,
    })
    agree: number;

    @ApiProperty({
        description:
            'Средняя оценка руководителя по меткам с оценкой, шкала 1–10; ' +
            'value null — оценок руководитель не ставил.',
        type: MetricDto,
    })
    ropScore: MetricDto;

    @ApiProperty({
        description:
            'Коды разделов рубрики из замечаний руководителя, по убыванию ' +
            'частоты.',
        type: [String],
        example: ['needs', 'closing'],
    })
    sections: string[];
}

/** Служебное досье: версия расчёта, прочитанные снапшоты и момент сборки. */
export class AiDossierMetaDto {
    @ApiProperty({
        description: 'Версия расчёта витрины (смена рвёт сравнимость).',
        type: String,
        example: 'ai-analytics-2.0.0',
    })
    calcVersion: string;

    @ApiProperty({
        description: 'Идентификаторы прочитанных записей ais, по возрастанию.',
        type: [String],
        example: ['01J8ZT0A', '01J8ZT0B'],
    })
    snapshotIds: string[];

    @ApiProperty({
        description: 'Момент сборки досье (ISO 8601, UTC).',
        type: String,
        example: '2026-09-22T06:15:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Месяцы окна досье YYYY-MM по возрастанию.',
        type: [String],
        example: ['2026-07', '2026-08', '2026-09'],
    })
    months: string[];
}
