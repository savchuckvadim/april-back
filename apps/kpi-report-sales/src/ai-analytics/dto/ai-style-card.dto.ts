import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import {
    AI_STYLE_CARD_STATUSES,
    AiStyleCardStatus,
} from '../constants/ai-style.const';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiStyleProfileDto } from './ai-style-profile.dto';

/**
 * Ось профиля в карточке: обе стороны оси нейтральны, отклонение — в
 * единицах разброса коллег с интервалом 80 %. Ось без маркеров в окне
 * приходит с `confidence: 'none'` и текстом причины, а не пустой.
 */
export class AiStyleAxisDto {
    @ApiProperty({
        description: 'Код оси стиля.',
        type: String,
        example: 'persistence',
    })
    code: string;

    @ApiProperty({
        description: 'Название оси для руководителя.',
        type: String,
        example: 'Повторные касания',
    })
    title: string;

    @ApiProperty({
        description: 'Отрицательный полюс оси (нейтральный).',
        type: String,
        example: 'редкие касания',
    })
    minus: string;

    @ApiProperty({
        description: 'Положительный полюс оси (нейтральный).',
        type: String,
        example: 'много касаний',
    })
    plus: string;

    @ApiProperty({
        description:
            'Усаженное отклонение от нормы коллег в единицах σ; ' +
            'отрицательное — сторона «минус».',
        type: Number,
        example: 0.42,
    })
    value: number;

    @ApiProperty({
        description: 'Интервал 80 % для отклонения: [нижняя, верхняя].',
        type: [Number],
        example: [0.18, 0.66],
    })
    ci80: number[];

    @ApiProperty({
        description: 'Наблюдений оси в окне (звонки, лиды, рабочие дни).',
        type: Number,
        example: 26,
    })
    n: number;

    @ApiProperty({
        description: 'Доверие к оси: ok | low | none.',
        type: String,
        example: 'ok',
    })
    confidence: string;

    @ApiProperty({
        description:
            'Причина пониженного доверия (few-calls, few-peers, ' +
            'indistinguishable, no-tenure, opt-out); null — доверие ok.',
        type: String,
        nullable: true,
        example: 'few-calls',
    })
    reason: string | null;
}

/**
 * Карточка стиля менеджера: профиль, оси, контекст работы и метод.
 *
 * Читают её руководитель периметра и САМ сотрудник (он видит свою
 * подпись первым — документ §1.3). Сотрудник, отказавшийся от
 * профилирования (`ai_analytics_style_opt_out`), получает карточку со
 * статусом `opt_out` без подписей и осей.
 */
export class AiStyleCardDto {
    @ApiProperty({
        description:
            'Состояние карточки: ready — профиль есть; few_data — данных ' +
            'пока мало (профиль не показывается); opt_out — профиль ' +
            'отключён по запросу сотрудника.',
        enum: AI_STYLE_CARD_STATUSES,
        example: 'ready',
    })
    status: AiStyleCardStatus;

    @ApiProperty({
        description: 'Bitrix-id менеджера карточки.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description: 'Месяц профиля (последний месяц окна), YYYY-MM.',
        type: String,
        nullable: true,
        example: '2026-08',
    })
    monthKey: string | null;

    @ApiProperty({
        description: 'Окно профиля: месяцы YYYY-MM по возрастанию.',
        type: [String],
        example: ['2026-06', '2026-07', '2026-08'],
    })
    window: string[];

    @ApiProperty({
        description:
            'Профиль стиля (подписи и вектор осей); null — данных мало ' +
            'или профиль отключён.',
        type: AiStyleProfileDto,
        nullable: true,
    })
    profile: AiStyleProfileDto | null;

    @ApiProperty({
        description:
            'Заметные особенности строкой — подписи БЕЗ оспоренных ' +
            '(оспоренная подпись вне карточки не используется). Пусто — ' +
            'особенностей нет или данных мало.',
        type: [String],
        example: ['чаще коллег возвращается после переноса: 62 % против 41 %'],
    })
    notable: string[];

    @ApiProperty({
        description: 'Оси профиля с интервалами и доверием.',
        type: [AiStyleAxisDto],
    })
    axes: AiStyleAxisDto[];

    @ApiProperty({
        description:
            'Форма воронки как КОНТЕКСТ (presenter | closer | balanced | ' +
            'unknown): это исход, в оси стиля он не входит.',
        type: String,
        example: 'closer',
    })
    funnelShape: string;

    @ApiProperty({
        description:
            'Профиль давно не пересчитывался (снапшот старше двух ' +
            'месяцев) — читать с оговоркой.',
        type: Boolean,
        example: false,
    })
    stale: boolean;

    @ApiProperty({
        description:
            'Пояснение пустого состояния или оговорка карточки; null — ' +
            'профиль показан без оговорок.',
        type: String,
        nullable: true,
        example: 'данных для стиля пока мало',
    })
    note: string | null;

    @ApiProperty({
        description: 'Блок «Как считаем»: метод, норма, периметр, запреты.',
        type: [String],
        example: ['Норма — коллеги портала без самого сотрудника…'],
    })
    howWeCount: string[];

    @ApiProperty({
        description:
            'Когда снапшот профиля рассчитан (ISO); null — профиля нет.',
        type: String,
        nullable: true,
        example: '2026-09-01T03:15:00.000Z',
    })
    generatedAt: string | null;
}

/** Запрос карточки стиля менеджера. */
export class AiStyleProfileRequestDto extends AiRequestBaseDto {
    @ApiProperty({
        description:
            'Bitrix-id менеджера, чей профиль нужен. Руководитель — любой ' +
            'из своего периметра, менеджер — только себя.',
        type: String,
        example: '512',
    })
    @IsString()
    @IsNotEmpty()
    managerId: string;

    @ApiPropertyOptional({
        description:
            'Месяц профиля YYYY-MM (последний месяц окна). Не передан — ' +
            'последний рассчитанный профиль менеджера.',
        type: String,
        example: '2026-08',
    })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-\d{2}$/, {
        message: 'monthKey должен быть в формате YYYY-MM',
    })
    monthKey?: string;
}
