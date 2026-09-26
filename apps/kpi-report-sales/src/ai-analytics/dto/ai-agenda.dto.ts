import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgendaReasonKind } from '@lib/sales-ai-analytics';
import { AiRequestBaseDto } from './ai-request-base.dto';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

const AGENDA_REASON_KINDS: readonly AgendaReasonKind[] = [
    'risk',
    'objection',
    'section',
];

/** Запрос повестки РОПа на неделю. */
export class AiAgendaRequestDto extends AiRequestBaseDto {}

/** Звонок повестки: почему попал, цитата, ссылка на разбор. */
export class AiAgendaItemDto {
    @ApiProperty({
        description: 'Id транскрипции звонка.',
        type: String,
        example: '10245',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Bitrix-id менеджера; null — не определён.',
        type: String,
        nullable: true,
        example: '512',
    })
    managerId: string | null;

    @ApiProperty({
        description: 'AI-тип звонка; null — не определён.',
        type: String,
        nullable: true,
        example: 'presentation',
    })
    callType: string | null;

    @ApiProperty({
        description:
            'Класс причины: риск-флаг → спорное возражение → слабый раздел.',
        enum: AGENDA_REASON_KINDS,
        example: 'objection',
    })
    kind: AgendaReasonKind;

    @ApiProperty({
        description: 'Причина попадания в повестку (текст для РОПа).',
        type: String,
        example: 'Спорное возражение (price): не отработано',
    })
    reason: string;

    @ApiProperty({
        description: 'Цитата из разбора.',
        type: String,
        example: 'У вас дорого, в другой системе то же самое дешевле',
    })
    quote: string;

    @ApiProperty({
        description:
            'Смещение цитаты в тексте транскрипта; null — текст не загружался.',
        type: Number,
        nullable: true,
        example: 1840,
    })
    charOffset: number | null;

    @ApiProperty({
        description:
            'Ссылка на карточку разбора в смарт-процессе «AI-анализ звонков»; ' +
            'null — элемент смарта не найден.',
        type: String,
        nullable: true,
        example: 'https://april.bitrix24.ru/crm/type/1054/details/77/',
    })
    link: string | null;

    @ApiProperty({
        description: 'Оценка звонка 0–100; null — нет.',
        type: Number,
        nullable: true,
        example: 72,
    })
    score: number | null;
}

/** Несогласие с разбором за неделю (feedback kind = disagree). */
export class AiAgendaDisagreementDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера; null — не указан.',
        type: String,
        nullable: true,
        example: '512',
    })
    managerId: string | null;

    @ApiProperty({
        description: 'Объект несогласия: call:<id>, section:<code> и т.п.',
        type: String,
        example: 'call:1024',
    })
    object: string;

    @ApiProperty({
        description: 'Причина несогласия; null — не указана.',
        type: String,
        nullable: true,
        example: 'Клиент сам перенёс встречу, оценка занижена',
    })
    reason: string | null;
}

/** Повестка РОПа: 3 звонка прошлой недели и несогласия (план, 6.3). */
export class AiAgendaDto {
    @ApiProperty({
        description: 'Ключ текущей ISO-недели планёрки (YYYY-Www).',
        type: String,
        example: '2026-W36',
    })
    weekKey: string;

    @ApiProperty({
        description:
            'Звонки повестки: прошлая полная ISO-неделя (пн–вс, TZ портала).',
        type: [AiAgendaItemDto],
    })
    items: AiAgendaItemDto[];

    @ApiProperty({
        description:
            'Несогласия с разбором: с понедельника прошлой недели по момент запроса.',
        type: [AiAgendaDisagreementDto],
    })
    disagreements: AiAgendaDisagreementDto[];
}

export class AiAgendaResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Повестка (при status = ready).',
        type: AiAgendaDto,
    })
    data?: AiAgendaDto;
}
