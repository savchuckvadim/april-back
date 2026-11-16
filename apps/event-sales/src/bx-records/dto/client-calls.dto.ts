import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    CLIENT_CALL_DIRECTIONS,
    CLIENT_CALL_OWNER_TYPES,
    CLIENT_CALL_STATES,
    type ClientCallDirection,
    type ClientCallOwnerType,
    type ClientCallState,
} from '../client-calls/client-calls.const';

/** К чему в CRM привязано дело звонка. */
export class ClientCallOwnerDto {
    @ApiProperty({
        description: 'Вид карточки CRM, к которой привязан звонок.',
        enum: CLIENT_CALL_OWNER_TYPES,
        example: 'deal',
    })
    type: ClientCallOwnerType;

    @ApiProperty({
        description: 'Номер карточки CRM.',
        type: Number,
        example: 79153,
    })
    id: number;
}

/** О чём договорились в звонке. */
export class ClientCallNextStepDto {
    @ApiProperty({
        description: 'Назначен ли следующий шаг.',
        type: Boolean,
        example: true,
    })
    set: boolean;

    @ApiPropertyOptional({
        description: 'Что договорились сделать.',
        type: String,
        nullable: true,
        example: 'Отправить коммерческое предложение и перезвонить',
    })
    description: string | null;

    @ApiPropertyOptional({
        description: 'Дата следующего шага, как её назвали в разговоре.',
        type: String,
        nullable: true,
        example: '2026-11-18',
    })
    date: string | null;
}

/** Короткий итог разбора звонка. */
export class ClientCallBriefDto {
    @ApiPropertyOptional({
        description: 'Тип звонка по разбору.',
        type: String,
        nullable: true,
        example: 'Презентация',
    })
    callTypeTitle: string | null;

    @ApiPropertyOptional({
        description:
            'Краткое резюме разговора — его менеджер может взять в комментарий отчёта.',
        type: String,
        nullable: true,
        example:
            'Менеджер показал комплект, клиент попросил коммерческое предложение.',
    })
    summary: string | null;

    @ApiPropertyOptional({
        description: 'Следующий шаг; разбор его не определил — null.',
        type: ClientCallNextStepDto,
        nullable: true,
    })
    nextStep: ClientCallNextStepDto | null;

    @ApiProperty({
        description: 'Сколько возражений клиента нашёл разбор.',
        type: Number,
        example: 2,
    })
    objections: number;

    @ApiProperty({
        description:
            'Разбор неполный: часть проверок не выполнилась и будет доделана позже.',
        type: Boolean,
        example: false,
    })
    incomplete: boolean;
}

/** Звонок клиента с записью и состоянием разбора. */
export class ClientCallDto {
    @ApiProperty({
        description: 'Номер дела звонка в Битрикс24.',
        type: Number,
        example: 781614,
    })
    activityId: number;

    @ApiPropertyOptional({
        description: 'Начало звонка, ISO 8601.',
        type: String,
        nullable: true,
        example: '2026-11-16T09:12:00.000Z',
    })
    startedAt: string | null;

    @ApiPropertyOptional({
        description:
            'Длительность разговора в секундах; известна после расшифровки.',
        type: Number,
        nullable: true,
        example: 312,
    })
    durationSec: number | null;

    @ApiPropertyOptional({
        description: 'Направление звонка.',
        enum: CLIENT_CALL_DIRECTIONS,
        nullable: true,
        example: 'outgoing',
    })
    direction: ClientCallDirection | null;

    @ApiPropertyOptional({
        description: 'Номер сотрудника, ответственного за дело звонка.',
        type: Number,
        nullable: true,
        example: 107,
    })
    responsibleId: number | null;

    @ApiPropertyOptional({
        description: 'Карточка CRM, к которой привязан звонок.',
        type: ClientCallOwnerDto,
        nullable: true,
    })
    owner: ClientCallOwnerDto | null;

    @ApiPropertyOptional({
        description: 'Название дела звонка.',
        type: String,
        nullable: true,
        example: 'Исходящий звонок',
    })
    subject: string | null;

    @ApiProperty({
        description:
            'Состояние разбора: analyzed — разобран, processing — разбирается, ' +
            'failed — разобрать не удалось, skipped — расшифрован без разбора, ' +
            'none — ещё не разбирался.',
        enum: CLIENT_CALL_STATES,
        example: 'analyzed',
    })
    state: ClientCallState;

    @ApiProperty({
        description: 'Состояние разбора словами.',
        type: String,
        example: 'Разобран',
    })
    stateTitle: string;

    @ApiPropertyOptional({
        description: 'Номер расшифровки; звонок не расшифровывался — null.',
        type: String,
        nullable: true,
        example: '48211',
    })
    transcriptionId: string | null;

    @ApiPropertyOptional({
        description:
            'Адрес страницы полного разбора звонка; разбора нет — null.',
        type: String,
        nullable: true,
        example: 'https://report.example.ru/call/48211.abc',
    })
    pageUrl: string | null;

    @ApiPropertyOptional({
        description: 'Короткий итог разбора; разбора нет — null.',
        type: ClientCallBriefDto,
        nullable: true,
    })
    brief: ClientCallBriefDto | null;
}

/** Звонки клиента по всем его связям в CRM. */
export class ClientCallsDto {
    @ApiProperty({
        description: 'Последние звонки клиента с записью, свежие первыми.',
        type: ClientCallDto,
        isArray: true,
    })
    calls: ClientCallDto[];

    @ApiProperty({
        description: 'Сколько звонков с записью найдено у клиента всего.',
        type: Number,
        example: 64,
    })
    total: number;

    @ApiProperty({
        description: 'Сколько последних звонков отдаётся за раз.',
        type: Number,
        example: 50,
    })
    limit: number;
}
