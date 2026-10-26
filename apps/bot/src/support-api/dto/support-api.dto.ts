import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator';
import { SUPPORT_REPLY_MAX_LENGTH, SupportDialogReportDto } from '@lib/support';
import { LogRowDto, LogsSummaryResponseDto } from '@lib/logger/query';
import type {
    SupportAuthorRole,
    SupportChatView,
    SupportClientErrors,
    SupportClient,
    SupportMessage,
    SupportReplyResult,
    SupportTaskResult,
} from '@lib/support';
import { SUPPORT_AUTHOR_ROLES } from '@lib/support';

const DOMAIN_PATTERN = /^[a-z0-9.-]+$/i;

export class SupportDomainQueryDto {
    @ApiPropertyOptional({
        description:
            'Портал открытой линии поддержки без протокола. Не указан — ' +
            'первый портал, где включён мониторинг поддержки (april-dev).',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    @IsOptional()
    @IsString()
    @Matches(DOMAIN_PATTERN, {
        message: 'domain — адрес портала без протокола',
    })
    domain?: string;
}

export class SupportDialogReadQueryDto extends SupportDomainQueryDto {
    @ApiPropertyOptional({
        description: 'Сколько последних сообщений чата вернуть: от 1 до 50.',
        type: Number,
        minimum: 1,
        maximum: 50,
        default: 30,
        example: 30,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    limit?: number;
}

export class SupportDialogsResponseDto {
    @ApiProperty({
        description: 'Портал линии.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Открытые диалоги линии: кто ждёт ответа и сколько.',
        type: [SupportDialogReportDto],
    })
    dialogs: SupportDialogReportDto[];

    @ApiProperty({
        description: 'Что прочитать не удалось.',
        type: [String],
        example: [],
    })
    warnings: string[];
}

export class SupportClientDto implements SupportClient {
    @ApiProperty({
        description: 'ID клиента-коннектора на портале линии.',
        type: Number,
        example: 123,
    })
    userId: number;

    @ApiProperty({
        description: 'Имя клиента.',
        type: String,
        example: 'Савчук Вадим',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Портал клиента для канала Network; null — неизвестен.',
        type: String,
        nullable: true,
        example: 'alfacentr.bitrix24.ru',
    })
    portal: string | null;
}

export class SupportParticipantDto {
    @ApiProperty({
        description: 'ID участника на портале линии.',
        type: Number,
        example: 135,
    })
    id: number;

    @ApiProperty({
        description: 'Имя участника.',
        type: String,
        example: 'Муравьева Юлия',
    })
    name: string;

    @ApiProperty({
        description: 'Роль: client — клиент, staff — сотрудник, other — бот.',
        type: String,
        enum: SUPPORT_AUTHOR_ROLES,
        example: 'staff',
    })
    role: SupportAuthorRole;
}

export class SupportMessageDto implements SupportMessage {
    @ApiProperty({ description: 'ID сообщения.', type: Number, example: 27079 })
    id: number;

    @ApiProperty({
        description: 'Когда написано (ISO 8601).',
        type: String,
        format: 'date-time',
        example: '2026-10-26T04:59:01.000Z',
    })
    at: Date;

    @ApiProperty({
        description:
            'Кто написал: client — клиент, staff — сотрудник, other — система или бот.',
        type: String,
        enum: SUPPORT_AUTHOR_ROLES,
        example: 'client',
    })
    role: SupportAuthorRole;

    @ApiPropertyOptional({
        description: 'Имя автора; null — система.',
        type: String,
        nullable: true,
        example: 'Савчук Вадим',
    })
    authorName: string | null;

    @ApiProperty({
        description: 'Текст без разметки Битрикса.',
        type: String,
        example: 'Добрый день! Это проверка связи.',
    })
    text: string;
}

export class SupportChatViewResponseDto implements SupportChatView {
    @ApiProperty({
        description: 'Портал линии.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({ description: 'Чат диалога.', type: Number, example: 769 })
    chatId: number;

    @ApiProperty({
        description: 'Ссылка на диалог в мессенджере портала линии.',
        type: String,
        example: 'https://april-dev.bitrix24.ru/online/?IM_DIALOG=chat769',
    })
    url: string;

    @ApiPropertyOptional({
        description:
            'Клиент чата; null — в прочитанных сообщениях его не видно.',
        type: SupportClientDto,
        nullable: true,
    })
    client: SupportClientDto | null;

    @ApiProperty({
        description: 'Участники чата.',
        type: [SupportParticipantDto],
    })
    participants: SupportParticipantDto[];

    @ApiProperty({
        description: 'Сообщения по времени; все сессии этого чата.',
        type: [SupportMessageDto],
    })
    messages: SupportMessageDto[];

    @ApiProperty({
        description: 'Есть сообщения старше возвращённых.',
        type: Boolean,
        example: false,
    })
    hasMore: boolean;
}

export class SupportReplyRequestDto extends SupportDomainQueryDto {
    @ApiProperty({
        description:
            'Текст ответа клиенту ровно в том виде, в каком его подтвердил человек.',
        type: String,
        maxLength: SUPPORT_REPLY_MAX_LENGTH,
        example:
            'Здравствуйте! Приняли ваш вопрос, смотрим и ответим здесь же.',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(SUPPORT_REPLY_MAX_LENGTH)
    text: string;

    @ApiProperty({
        description:
            'Кто из сотрудников подтвердил отправку («да»). Пишется в журнал и ' +
            'в копию для Telegram-чата поддержки. Без подтверждения человека ' +
            'клиенту не пишем.',
        type: String,
        example: 'Вадим Савчук',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(200)
    confirmedBy: string;
}

export class SupportReplyResponseDto implements SupportReplyResult {
    @ApiProperty({
        description: 'Портал линии.',
        type: String,
        example: 'april-dev.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({ description: 'Чат диалога.', type: Number, example: 769 })
    chatId: number;

    @ApiProperty({
        description: 'ID отправленного сообщения.',
        type: Number,
        example: 27101,
    })
    messageId: number;

    @ApiProperty({
        description:
            'Пришлось присоединиться к диалогу: его ведёт другой оператор, он и остаётся ответственным.',
        type: Boolean,
        example: true,
    })
    joined: boolean;
}

export class SupportTaskRequestDto extends SupportDomainQueryDto {
    @ApiProperty({
        description: 'Название задачи на исправление.',
        type: String,
        example: 'Не отправляется отчёт о звонке у клиента',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(250)
    title: string;

    @ApiProperty({
        description:
            'Что случилось и что проверить. Ссылка на диалог добавится сама.',
        type: String,
        example:
            'Клиент пишет, что отчёт висит в «Отправляется». Скриншот в диалоге.',
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(10000)
    description: string;

    @ApiProperty({
        description: 'ID ответственного на портале оповещений (april-garant).',
        type: Number,
        example: 1,
    })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    responsibleId: number;

    @ApiPropertyOptional({
        description:
            'Чат линии, из которого задача: ссылка на диалог попадёт в описание.',
        type: Number,
        example: 769,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    chatId?: number;
}

export class SupportTaskResponseDto implements SupportTaskResult {
    @ApiProperty({
        description: 'Портал, где создана задача.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({ description: 'ID задачи.', type: Number, example: 120345 })
    taskId: number;

    @ApiProperty({
        description: 'Ссылка на задачу.',
        type: String,
        example:
            'https://april-garant.bitrix24.ru/company/personal/user/0/tasks/task/view/120345/',
    })
    url: string;
}

export class SupportClientErrorsQueryDto {
    @ApiProperty({
        description:
            'Портал клиента без протокола — из диалога (clientPortal), не портал линии.',
        type: String,
        example: 'alfacentr.bitrix24.ru',
    })
    @IsString()
    @IsNotEmpty()
    @Matches(DOMAIN_PATTERN, {
        message: 'domain — адрес портала без протокола',
    })
    domain: string;

    @ApiPropertyOptional({
        description: 'Окно в часах: от 1 до 720.',
        type: Number,
        minimum: 1,
        maximum: 720,
        default: 24,
        example: 24,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(720)
    hours?: number;
}

export class SupportClientErrorsResponseDto implements SupportClientErrors {
    @ApiProperty({
        description: 'Портал клиента.',
        type: String,
        example: 'alfacentr.bitrix24.ru',
    })
    domain: string;

    @ApiProperty({
        description: 'Сводка журналов по порталу с выводами словами.',
        type: LogsSummaryResponseDto,
    })
    summary: LogsSummaryResponseDto;

    @ApiProperty({
        description: 'Последние ошибки по порталу, новые сверху.',
        type: [LogRowDto],
    })
    recent: LogRowDto[];
}
