/**
 * DTO ручки `GET admin/ai-analytics/feedback` (план Фазы 3, П5): сводка
 * обратной связи витрины за период. Расход модели — в соседнем файле
 * `ai-analytics-cost.dto.ts` (лимит 300 строк).
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches } from 'class-validator';
import {
    AI_ANALYTICS_FEEDBACK_KINDS,
    AiAnalyticsFeedbackKind,
} from '../../contracts/feedback.types';
import type {
    FeedbackKindCount,
    FeedbackManagerCount,
    FeedbackSummary,
} from '../services/ai-analytics-feedback-summary.service';
import { AI_ANALYTICS_KEY_PATTERNS } from './ai-analytics-pipeline-admin.dto';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Запрос сводки обратной связи за период дат. */
export class AiAnalyticsFeedbackQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;

    @ApiProperty({
        description: 'Начало периода YYYY-MM-DD включительно (по UTC).',
        example: '2026-09-01',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.day, {
        message: 'from: ожидается YYYY-MM-DD',
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода YYYY-MM-DD включительно (по UTC).',
        example: '2026-09-21',
        type: String,
    })
    @IsString()
    @Matches(AI_ANALYTICS_KEY_PATTERNS.day, {
        message: 'to: ожидается YYYY-MM-DD',
    })
    to: string;
}

/** Счётчик по виду записи обратной связи. */
export class AiAnalyticsFeedbackKindDto implements FeedbackKindCount {
    @ApiProperty({
        description:
            'Вид записи: реакции витрины (view, useful, not_useful, ' +
            'disagree), факты доставки push (alert_sent, alert_handled, ' +
            'digest_sent, agenda_sent) и слепая метка руководителя ' +
            '(rop_mark).',
        example: 'useful',
        type: String,
        enum: AI_ANALYTICS_FEEDBACK_KINDS,
    })
    kind: AiAnalyticsFeedbackKind;

    @ApiProperty({
        description: 'Сколько таких записей в периоде.',
        example: 14,
        type: Number,
    })
    count: number;
}

/** Сводка по менеджеру. */
export class AiAnalyticsFeedbackManagerDto implements FeedbackManagerCount {
    @ApiProperty({
        description: 'Менеджер записи; null — запись без менеджера.',
        example: '154',
        type: String,
        nullable: true,
    })
    managerId: string | null;

    @ApiProperty({
        description: 'Всего записей по менеджеру в периоде.',
        example: 22,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description: 'Разрез по видам записей.',
        type: [AiAnalyticsFeedbackKindDto],
    })
    byKind: AiAnalyticsFeedbackKindDto[];
}

/** Ответ ручки обратной связи. */
export class AiAnalyticsFeedbackResultDto implements FeedbackSummary {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Начало периода YYYY-MM-DD.',
        example: '2026-09-01',
        type: String,
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода YYYY-MM-DD.',
        example: '2026-09-21',
        type: String,
    })
    to: string;

    @ApiProperty({
        description: 'Записей обратной связи распознанной формы в периоде.',
        example: 96,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description:
            'Записей чужой формы (без распознанного вида) — в счётчики ' +
            'не вошли, но видны, чтобы молчаливая потеря не пряталась.',
        example: 0,
        type: Number,
    })
    skipped: number;

    @ApiProperty({
        description: 'Разрез по видам записей; виды без записей опущены.',
        type: [AiAnalyticsFeedbackKindDto],
    })
    byKind: AiAnalyticsFeedbackKindDto[];

    @ApiProperty({
        description: 'Разрез по менеджерам, по убыванию числа записей.',
        type: [AiAnalyticsFeedbackManagerDto],
    })
    byManager: AiAnalyticsFeedbackManagerDto[];

    @ApiProperty({
        description:
            'Доля полезных реакций, %: useful от суммы useful, ' +
            'not_useful и disagree. null — оценок в периоде не было.',
        example: 72.7,
        type: Number,
        nullable: true,
    })
    usefulRatePct: number | null;
}
