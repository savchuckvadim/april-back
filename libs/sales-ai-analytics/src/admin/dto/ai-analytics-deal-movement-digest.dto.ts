/**
 * DTO итога сводки руководителям за прогон движения сделок (вторая волна,
 * часть Б, 17.11.2026) — часть состояния прогона и дневного снимка.
 * Оформление — ai/rules/dto-conventions.md.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    DEAL_MOVEMENT_DIGEST_SKIP,
    type DealMovementDigestSkip,
    type DealMovementDigestSummary,
} from '../../contracts/deal-movement-digest.types';

export class AiAnalyticsDealMovementDigestDto
    implements DealMovementDigestSummary
{
    @ApiProperty({
        description: 'Сводка руководителям включена настройкой портала.',
        example: true,
        type: Boolean,
    })
    enabled: boolean;

    @ApiProperty({
        description:
            'Почему не рассылалась: disabled — выключена, manual — ручной ' +
            'счёт (сводка только после ночного), already_sent — сегодня уже ' +
            'уходила, no_recipients — получатели не заданы, not_due — сводка ' +
            'раз в неделю / две недели, а сегодня не её день; null — рассылалась.',
        enum: Object.values(DEAL_MOVEMENT_DIGEST_SKIP),
        example: null,
        type: String,
        nullable: true,
    })
    skipped: DealMovementDigestSkip | null;

    @ApiProperty({
        description:
            'Получателей, кому сводка положена (работают, есть что показать).',
        example: 6,
        type: Number,
    })
    recipients: number;

    @ApiProperty({
        description: 'Сколько сводок дошло хотя бы одним каналом.',
        example: 6,
        type: Number,
    })
    sent: number;

    @ApiProperty({
        description: 'Сколько сводок не дошло ни одним каналом.',
        example: 0,
        type: Number,
    })
    failed: number;

    @ApiPropertyOptional({
        description:
            'Сколько сделок ночи со свежей находкой аудита сделок («забыта»); ' +
            'нет у сводок до 18.11.2026 и у пропущенных.',
        example: 4,
        type: Number,
    })
    auditForgotten?: number;

    @ApiPropertyOptional({
        description:
            'Сводка за неделю или две: сколько сделок попало в блок «Давно ' +
            'без продвижения» (в стадии вдвое, втрое… дольше срока, каждая ' +
            'ступень — один раз); нет у ежедневных и пропущенных сводок.',
        example: 9,
        type: Number,
    })
    reminders?: number;
}
