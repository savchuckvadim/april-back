import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import {
    ROP_MARK_REASONS,
    type RopMarkReason,
} from '@lib/sales-ai-analytics/model/rop-mark';
import {
    AI_ROP_MARK_BLIND_NOTE,
    AI_ROP_MARK_WEEKLY_LIMIT,
} from '../constants/ai-rop-mark.const';
import { AiAnalyticsEnvelopeDto } from './ai-response-envelope.dto';

/**
 * Ответы слепой проверки «три звонка недели» (план Фазы 2, поток 15;
 * постановка — `ai-sales-analytics-plan.md` §12 и §4.11).
 *
 * ⚠ Слепой режим гарантируется ТОЛЬКО этой ручкой: поля `aiCallType` и
 * `aiScore` не заполняются, пока по звонку нет метки. Карточку разбора в
 * Битрикс руководитель открыть может и оценку там увидит — техническими
 * средствами это не закрывается (см. `AI_ROP_MARK_BLIND_NOTE` и README).
 * Запросы — в `ai-rop-mark-request.dto.ts`.
 */

/** Метка руководителя по звонку в ответе. */
export class AiRopMarkDto {
    @ApiProperty({
        description: 'Согласен ли руководитель с оценкой AI.',
        type: Boolean,
        example: false,
    })
    agree: boolean;

    @ApiProperty({
        description: 'Оценка руководителя 1–10; null — не поставил.',
        type: Number,
        nullable: true,
        example: 6,
    })
    ropScore: number | null;

    @ApiProperty({
        description: 'Разделы рубрики, к которым относится замечание.',
        isArray: true,
        enum: CALL_REPORT_SECTION_CODES,
        example: ['NEEDS'],
    })
    sections: string[];

    @ApiProperty({
        description: 'Почему так (текст руководителя).',
        type: String,
        example: 'Потребность не выявлена',
    })
    why: string;

    @ApiProperty({
        description: 'Как лучше (текст руководителя).',
        type: String,
        example: 'Два вопроса про процесс до предложения',
    })
    howTo: string;

    @ApiProperty({
        description:
            'Метка поставлена вслепую: оценка AI на момент сохранения ' +
            'этой ручкой не отдавалась. Повторная метка по тому же звонку ' +
            'уже не слепая — оценка к тому времени раскрыта.',
        type: Boolean,
        example: true,
    })
    blind: boolean;

    @ApiProperty({
        description: 'Когда метка поставлена, ISO (UTC).',
        type: String,
        example: '2026-09-07T09:10:00.000Z',
    })
    markedAt: string;
}

/** Один подобранный звонок недели. */
export class AiRopMarkCallDto {
    @ApiProperty({
        description: 'Id транскрипции звонка.',
        type: String,
        example: '1024',
    })
    transcriptionId: string;

    @ApiProperty({
        description: 'Bitrix-id менеджера, чей это звонок.',
        type: String,
        example: '512',
    })
    managerId: string;

    @ApiProperty({
        description:
            'Почему звонок попал в подбор: uncertain_type — тип определён ' +
            'неуверенно; best_score — лучший балл недели (проверка на ' +
            'подыгрывание метрике); random — случайный.',
        enum: ROP_MARK_REASONS,
        example: 'best_score',
    })
    reason: RopMarkReason;

    @ApiProperty({
        description: 'Причина подбора по-русски (подпись для витрины).',
        type: String,
        example: 'Лучший балл недели (проверка метрики)',
    })
    reasonTitle: string;

    @ApiProperty({
        description: 'Метка по звонку уже сохранена.',
        type: Boolean,
        example: false,
    })
    marked: boolean;

    @ApiPropertyOptional({
        description:
            'Тип звонка по классификатору. ⚠ Отдаётся ТОЛЬКО после ' +
            'сохранения метки: до неё проверка слепая.',
        type: String,
        nullable: true,
        example: 'presentation',
    })
    aiCallType?: string | null;

    @ApiPropertyOptional({
        description:
            'Оценка разбора в шкале 0–100. ⚠ Отдаётся ТОЛЬКО после ' +
            'сохранения метки: до неё проверка слепая.',
        type: Number,
        nullable: true,
        example: 92,
    })
    aiScore?: number | null;

    @ApiPropertyOptional({
        description: 'Метка руководителя, если она уже поставлена.',
        type: AiRopMarkDto,
    })
    mark?: AiRopMarkDto;
}

/** Подбор недели целиком. */
export class AiRopMarkWeekDto {
    @ApiProperty({
        description: 'Ключ ISO-недели подбора.',
        type: String,
        example: '2026-W36',
    })
    weekKey: string;

    @ApiProperty({
        description: 'Понедельник недели в TZ портала.',
        type: String,
        example: '2026-08-31',
    })
    from: string;

    @ApiProperty({
        description: 'Воскресенье недели в TZ портала.',
        type: String,
        example: '2026-09-06',
    })
    to: string;

    @ApiProperty({
        description:
            `Подобранные звонки: до ${AI_ROP_MARK_WEEKLY_LIMIT} — весь ` +
            'человеческий бюджет недели. Кандидатов меньше — вернётся ' +
            'столько, сколько есть; список видимости запрашивающего ' +
            'дополнительно режется его периметром.',
        type: AiRopMarkCallDto,
        isArray: true,
    })
    calls: AiRopMarkCallDto[];

    @ApiProperty({
        description: 'Когда сделан подбор, ISO (UTC).',
        type: String,
        example: '2026-09-07T00:15:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({
        description: AI_ROP_MARK_BLIND_NOTE,
        type: String,
        example: AI_ROP_MARK_BLIND_NOTE,
    })
    blindNote: string;
}

/** Результат сохранения метки. */
export class AiRopMarkSaveResultDto {
    @ApiProperty({
        description: 'Id записи ais с меткой.',
        type: String,
        example: '9001',
    })
    id: string;

    @ApiProperty({
        description:
            'Метка заменила предыдущую по этому звонку (прошлая ушла в ' +
            'status = superseded, история проверок сохранена).',
        type: Boolean,
        example: false,
    })
    replaced: boolean;

    @ApiProperty({
        description:
            'Метка поставлена вслепую (оценка AI этой ручкой ещё не ' +
            'раскрывалась).',
        type: Boolean,
        example: true,
    })
    blind: boolean;
}

export class AiRopMarkWeekResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Подбор недели и метки по нему.',
        type: AiRopMarkWeekDto,
    })
    data?: AiRopMarkWeekDto;
}

export class AiRopMarkSaveResponseDto extends AiAnalyticsEnvelopeDto {
    @ApiPropertyOptional({
        description: 'Результат сохранения метки.',
        type: AiRopMarkSaveResultDto,
    })
    data?: AiRopMarkSaveResultDto;
}
