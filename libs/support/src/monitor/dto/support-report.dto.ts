import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SUPPORT_SIGNAL_KINDS } from '../domain/support-dialog.types';
import type { SupportSignalKind } from '../domain/support-dialog.types';
import type {
    SupportDialogReport,
    SupportSignalReport,
} from '../application/support-monitor.report';

/** DTO отчёта монитора: общие для предпросмотра админки и Support API. */

export class SupportDialogReportDto implements SupportDialogReport {
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
        description: 'Номер открытой линии (CONFIG_ID).',
        type: Number,
        example: 9,
    })
    lineId: number;

    @ApiProperty({
        description: 'Имя клиента в диалоге.',
        type: String,
        example: 'Савчук Вадим',
    })
    clientName: string;

    @ApiPropertyOptional({
        description:
            'Портал клиента для канала Network; null — канал без портала.',
        type: String,
        nullable: true,
        example: 'alfacentr.bitrix24.ru',
    })
    clientPortal: string | null;

    @ApiPropertyOptional({
        description:
            'Оператор, который взял диалог; null — пока никто не взял.',
        type: String,
        nullable: true,
        example: 'Муравьева Юлия',
    })
    operatorName: string | null;

    @ApiProperty({
        description:
            'Сколько минут клиент ждёт ответа сотрудника; 0 — ответили.',
        type: Number,
        example: 12,
    })
    waitedMinutes: number;

    @ApiPropertyOptional({
        description:
            'Первое сообщение клиента, на которое ещё не ответили; null — ответили.',
        type: String,
        nullable: true,
        example: 'Добрый день! Не открывается отчёт.',
    })
    pendingText: string | null;

    @ApiProperty({
        description: 'Ссылка на диалог в мессенджере портала линии.',
        type: String,
        example: 'https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769',
    })
    url: string;

    @ApiPropertyOptional({
        description:
            'Карточка CRM на портале линии, к которой линия привязала диалог; null — нет привязки.',
        type: String,
        nullable: true,
        example: 'https://april-dev.bitrix24.ru/crm/deal/details/16867/',
    })
    crmUrl: string | null;
}

export class SupportSignalReportDto implements SupportSignalReport {
    @ApiProperty({
        description:
            'Вид оповещения: new_dialog — новый диалог, waiting — клиент ждёт ' +
            'ответа (напоминание), escalation — ждёт долго (срочный повтор).',
        type: String,
        enum: SUPPORT_SIGNAL_KINDS,
        example: 'waiting',
    })
    kind: SupportSignalKind;

    @ApiProperty({
        description: 'Номер сессии (диалога) линии.',
        type: Number,
        example: 71,
    })
    sessionId: number;

    @ApiProperty({
        description: 'Имя клиента.',
        type: String,
        example: 'Савчук Вадим',
    })
    clientName: string;

    @ApiProperty({
        description: 'Сколько минут клиент ждёт ответа.',
        type: Number,
        example: 12,
    })
    waitedMinutes: number;

    @ApiProperty({
        description:
            'Текст колокольчика Битрикса (BB-код), как его получат сотрудники.',
        type: String,
        example: '[B]Клиент ждёт ответа 12 мин[/B]',
    })
    bellText: string;

    @ApiProperty({
        description: 'Текст для Telegram-чата поддержки (HTML).',
        type: String,
        example: '⏳ <b>Клиент ждёт ответа 12 мин</b>',
    })
    telegramText: string;

    @ApiProperty({
        description:
            'Скольким сотрудникам доставлен колокольчик; в предпросмотре всегда 0.',
        type: Number,
        example: 0,
    })
    bellDelivered: number;

    @ApiProperty({
        description: 'Принят ли Telegram; в предпросмотре всегда false.',
        type: Boolean,
        example: false,
    })
    telegramDelivered: boolean;

    @ApiProperty({
        description:
            'Запомнено ли как разосланное; в предпросмотре всегда false.',
        type: Boolean,
        example: false,
    })
    remembered: boolean;
}
