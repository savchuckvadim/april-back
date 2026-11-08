import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
} from 'class-validator';
import type { SupportDialogStatsResult } from '../../application/support-dialog-history.service';
import type { SupportDialogHistoryItem } from '../../domain/support-dialog-stats';

export const SUPPORT_STATS_DEFAULT_DAYS = 30;

export class SupportDialogStatsQueryDto {
    @ApiProperty({
        description:
            'Портал клиента — как его видит линия поддержки (сайт участника ' +
            'Битрикс24-сети), без протокола и пути.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+$/i, {
        message: 'clientPortal — адрес портала без протокола и пути',
    })
    clientPortal: string;

    @ApiPropertyOptional({
        description: 'За сколько последних дней считать обращения.',
        type: Number,
        minimum: 1,
        maximum: 365,
        default: SUPPORT_STATS_DEFAULT_DAYS,
        example: 30,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(365)
    days?: number;
}

export class SupportDialogHistoryItemDto implements SupportDialogHistoryItem {
    @ApiProperty({
        description: 'Номер сессии (диалога) линии.',
        type: Number,
        example: 71,
    })
    sessionId: number;

    @ApiProperty({
        description: 'Номер чата диалога в мессенджере портала линии.',
        type: Number,
        example: 769,
    })
    chatId: number;

    @ApiProperty({
        description: 'Портал, где живёт открытая линия поддержки.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    lineDomain: string;

    @ApiProperty({
        description: 'Имя клиента в диалоге.',
        type: String,
        nullable: true,
        example: 'Савчук Вадим',
    })
    clientName: string | null;

    @ApiProperty({
        description: 'Сотрудник поддержки, который взял диалог.',
        type: String,
        nullable: true,
        example: 'Иванов Пётр',
    })
    operatorName: string | null;

    @ApiProperty({
        description: 'Когда монитор впервые увидел обращение.',
        type: Date,
        nullable: true,
        example: '2026-11-08T09:15:00.000Z',
    })
    firstSeenAt: Date | null;

    @ApiProperty({
        description: 'Когда диалог пропал из открытых; null — ещё открыт.',
        type: Date,
        nullable: true,
        example: null,
    })
    closedAt: Date | null;

    @ApiProperty({
        description: 'Сколько дольше всего клиент ждал ответа, минут.',
        type: Number,
        example: 12,
    })
    maxWaitedMinutes: number;

    @ApiProperty({
        description: 'Сотрудник ответил хотя бы раз.',
        type: Boolean,
        example: true,
    })
    answered: boolean;

    @ApiProperty({
        description: 'Ссылка на диалог в чате линии поддержки.',
        type: String,
        example: 'https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769',
    })
    url: string;
}

export class SupportDialogStatsResponseDto implements SupportDialogStatsResult {
    @ApiProperty({
        description:
            'История ведётся. false — таблица ещё не создана, цифры пустые, ' +
            'причина в reason.',
        type: Boolean,
        example: true,
    })
    available: boolean;

    @ApiProperty({
        description: 'Почему статистики нет; null — всё в порядке.',
        type: String,
        nullable: true,
        example: null,
    })
    reason: string | null;

    @ApiProperty({
        description: 'Портал клиента, по которому посчитано.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    clientPortal: string;

    @ApiProperty({
        description: 'Период, дней.',
        type: Number,
        example: 30,
    })
    days: number;

    @ApiProperty({
        description:
            'С какого момента монитор ведёт учёт обращений; null — ещё ни одной записи.',
        type: Date,
        nullable: true,
        example: '2026-11-08T12:00:00.000Z',
    })
    trackedSince: Date | null;

    @ApiProperty({
        description: 'Обращений за период.',
        type: Number,
        example: 7,
    })
    total: number;

    @ApiProperty({
        description: 'Из них ещё открыты.',
        type: Number,
        example: 1,
    })
    open: number;

    @ApiProperty({
        description:
            'Закрыты без единого ответа сотрудника (как видел монитор).',
        type: Number,
        example: 0,
    })
    closedUnanswered: number;

    @ApiProperty({
        description:
            'Среднее «дольше всего ждал» по обращениям, где клиент ждал, минут; ' +
            'null — никто не ждал.',
        type: Number,
        nullable: true,
        example: 6,
    })
    avgWaitMinutes: number | null;

    @ApiProperty({
        description: 'Самое долгое ожидание ответа за период, минут.',
        type: Number,
        example: 25,
    })
    longestWaitMinutes: number;

    @ApiProperty({
        description: 'Когда пришло последнее обращение.',
        type: Date,
        nullable: true,
        example: '2026-11-08T09:15:00.000Z',
    })
    lastAt: Date | null;

    @ApiProperty({
        description: 'Последние обращения, новые первыми (до 10).',
        type: [SupportDialogHistoryItemDto],
    })
    recent: SupportDialogHistoryItemDto[];
}
