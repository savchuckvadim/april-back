import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Служебная сводка обзора: объёмы, исключения и флаги расчёта. Вынесена из
 * `ai-overview.dto.ts` по лимиту 300 строк. Новые поля необязательны:
 * обзор из кэша, собранный раньше, их не содержит.
 */
export class AiOverviewMetaDto {
    @ApiProperty({
        description: 'Звонков в телефонии за период (lite-выборка).',
        type: Number,
        example: 640,
    })
    totalCalls: number;

    @ApiProperty({
        description: 'Разобранных сравнимых звонков в слое качества.',
        type: Number,
        example: 410,
    })
    analyzedCalls: number;

    @ApiProperty({
        description: 'Звонков без менеджера (в строки не попали).',
        type: Number,
        example: 12,
    })
    skippedNoManager: number;

    @ApiPropertyOptional({
        description:
            'Разобранных звонков периода, исключённых из оценок как ' +
            'несопоставимые: звонок раньше comparableFrom обзора (сменилась ' +
            'версия промпта, рубрики или классификатора — старые разборы ' +
            'считались по другим правилам). Это не поломка: число падает ' +
            'по мере накопления разборов новой версии. Нет поля — обзор ' +
            'из кэша, собранного до появления счётчика.',
        type: Number,
        example: 214,
    })
    excludedBeforeComparable?: number;

    @ApiProperty({
        description: 'Доля other + irrelevant среди разобранных, %.',
        type: Number,
        example: 6.3,
    })
    otherSharePct: number;

    @ApiProperty({
        description: 'Несогласий (feedback disagree) за период.',
        type: Number,
        example: 3,
    })
    disagreementsCount: number;

    @ApiProperty({
        description: 'Результат отдан из кэша.',
        type: Boolean,
        example: true,
    })
    fromCache: boolean;

    @ApiProperty({
        description: 'Момент расчёта (ISO, UTC).',
        type: String,
        example: '2026-09-06T02:31:12.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: 'Флаг confirmedOnly запроса (в Фазе 1b не применяется).',
        type: Boolean,
        example: false,
    })
    confirmedOnly: boolean;
}
