import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KpiDigestPresentationsDto } from './digest-presentations.dto';
import {
    KPI_DIGEST_PERIOD_KINDS,
    KPI_DIGEST_RESPONSE_STATUSES,
    KPI_DIGEST_TYPE_GROUPS,
    KpiDigestPeriodKind,
    KpiDigestResponseStatus,
    KpiDigestTypeGroup,
} from '../constants/digest.const';

/**
 * Ответ дневного дайджеста. Валидаторов нет — DTO только исходящие;
 * Swagger-описания полные, чтобы orval собрал типы фронта.
 */

/** Счётчик с разбивкой по типам событий (код item'а → количество). */
export class KpiDigestCountDto {
    @ApiProperty({ description: 'Итого по всем типам.', example: 7 })
    total: number;

    @ApiProperty({
        description:
            'Разбивка по кодам типов события (xo, call, presentation…).',
        type: 'object',
        additionalProperties: { type: 'number' },
        example: { xo: 4, call: 2, presentation: 1 },
    })
    byType: Record<string, number>;
}

/** Одна запись списка sales_kpi в компактном виде (событие менеджера). */
export class KpiDigestRecordDto {
    @ApiProperty({ description: 'ID элемента списка.', example: '10234' })
    id: string;

    @ApiProperty({ description: 'ID ответственного.', example: 42 })
    userId: number;

    @ApiProperty({
        description: 'Код типа события (item event_type без префикса).',
        type: String,
        nullable: true,
        example: 'presentation',
    })
    typeCode: string | null;

    @ApiProperty({
        description: 'Название типа события с портала.',
        type: String,
        nullable: true,
        example: 'Презентация',
    })
    typeName: string | null;

    @ApiProperty({
        description:
            'Код действия (plan / pound / done / act_noresult_fail / expired / act_send).',
        type: String,
        nullable: true,
        example: 'done',
    })
    actionCode: string | null;

    @ApiProperty({
        description: 'Название действия с портала.',
        type: String,
        nullable: true,
        example: 'Состоялся',
    })
    actionName: string | null;

    @ApiProperty({
        description:
            'Дата события (момент записи) в локальном времени портала, ' +
            'YYYY-MM-DD HH:mm:ss.',
        type: String,
        nullable: true,
        example: '2026-10-14 10:15:00',
    })
    eventDate: string | null;

    @ApiProperty({
        description:
            'Дедлайн плана (следующая коммуникация), YYYY-MM-DD HH:mm:ss.',
        type: String,
        nullable: true,
        example: '2026-10-16 12:00:00',
    })
    planDate: string | null;

    @ApiProperty({
        description:
            'Результативность (op_call_result_yes / op_call_result_no).',
        type: String,
        nullable: true,
        example: 'op_call_result_yes',
    })
    resultCode: string | null;

    @ApiProperty({
        description: 'Код причины нерезультата (secretar, nopickup, busy…).',
        type: String,
        nullable: true,
        example: 'nopickup',
    })
    noresultReason: string | null;

    @ApiProperty({
        description: 'Комментарий менеджера (обрезан до 400 символов).',
        example: 'Договорились созвониться в четверг',
    })
    comment: string;

    @ApiProperty({
        description: 'NAME элемента (заголовок события).',
        example: 'Звонок ООО Ромашка',
    })
    name: string;

    @ApiProperty({
        description:
            'CRM-ссылки записи: D_{id} сделка, CO_{id} компания, C_{id} контакт, L_{id} лид.',
        type: [String],
        example: ['CO_15', 'D_1024'],
    })
    crmRefs: string[];

    @ApiProperty({
        description: 'ID компании из поля crm_company (если есть).',
        type: Number,
        nullable: true,
        example: 15,
    })
    companyId: number | null;
}

/** Корзина часа: звонки и эфир. */
export class KpiDigestHourDto {
    @ApiProperty({
        description: 'Час суток 0..23 (время портала).',
        example: 10,
    })
    hour: number;

    @ApiProperty({ description: 'Звонков, начатых в этот час.', example: 6 })
    calls: number;

    @ApiProperty({
        description: 'Эфирное время звонков этого часа, секунд.',
        example: 920,
    })
    seconds: number;
}

export class KpiDigestDirectionDto {
    @ApiProperty({
        description: 'Количество звонков направления.',
        example: 12,
    })
    count: number;

    @ApiProperty({
        description: 'Эфирное время направления, секунд.',
        example: 1800,
    })
    seconds: number;
}

/** Фактические звонки сотрудника за день (voximplant.statistic.get). */
export class KpiDigestCallsDto {
    @ApiProperty({
        description: 'Наборов номера (все звонки с длительностью > 0).',
        example: 25,
    })
    callsCount: number;

    @ApiProperty({ description: 'Эфирное время, секунд.', example: 3650 })
    airtimeSeconds: number;

    @ApiProperty({ type: KpiDigestDirectionDto })
    incoming: KpiDigestDirectionDto;

    @ApiProperty({ type: KpiDigestDirectionDto })
    outgoing: KpiDigestDirectionDto;

    @ApiProperty({
        description:
            'Счётчики по бакетам длительности, как в calling-statistic: ' +
            'all — все, 30/60/180/300/600 — звонки дольше N секунд.',
        type: 'object',
        additionalProperties: { type: 'number' },
        example: { all: 25, '30': 14, '60': 9, '180': 3, '300': 1, '600': 0 },
    })
    byDuration: Record<string, number>;

    @ApiProperty({
        description: 'Почасовые корзины 0..23 (всегда 24 элемента).',
        type: [KpiDigestHourDto],
    })
    byHour: KpiDigestHourDto[];
}

/** Счётчики дня по событиям списка (сотрудник или сводка по всем). */
export class KpiDigestCountersDto {
    @ApiProperty({
        description:
            'Запланировано на начало дня: план/перенос с дедлайном в этот ' +
            'день, созданные до его начала.',
        type: KpiDigestCountDto,
    })
    plannedAtStart: KpiDigestCountDto;

    @ApiProperty({
        description: 'Новые планы, созданные в этот день (action plan).',
        type: KpiDigestCountDto,
    })
    planned: KpiDigestCountDto;

    @ApiProperty({
        description:
            'Запланировано на будущее: план/перенос этого дня с дедлайном ' +
            'позже конца дня.',
        type: KpiDigestCountDto,
    })
    plannedBeyond: KpiDigestCountDto;

    @ApiProperty({
        description: 'Проведено результативно (action done).',
        type: KpiDigestCountDto,
    })
    done: KpiDigestCountDto;

    @ApiProperty({
        description: 'Не состоялось (action act_noresult_fail).',
        type: KpiDigestCountDto,
    })
    notHeld: KpiDigestCountDto;

    @ApiProperty({
        description: 'Перенесено (action pound).',
        type: KpiDigestCountDto,
    })
    postponed: KpiDigestCountDto;

    @ApiProperty({
        description: 'Просрочено (action expired).',
        type: KpiDigestCountDto,
    })
    expired: KpiDigestCountDto;

    @ApiProperty({
        description: 'Отправленные документы по типам (КП, счета, договоры).',
        type: KpiDigestCountDto,
    })
    documents: KpiDigestCountDto;

    @ApiProperty({ description: 'Продажи (ev_success + done).', example: 1 })
    sales: number;

    @ApiProperty({ description: 'Отказы (ev_fail + done).', example: 0 })
    refusals: number;

    @ApiProperty({
        description:
            'Причины нерезультата (код → количество) у несостоявшихся и перенесённых.',
        type: 'object',
        additionalProperties: { type: 'number' },
        example: { nopickup: 3, secretar: 1 },
    })
    noresultReasons: Record<string, number>;
}

/** Строка дайджеста одного сотрудника. */
export class KpiDigestEmployeeDto extends KpiDigestCountersDto {
    @ApiProperty({ description: 'ID сотрудника Bitrix.', example: 42 })
    userId: number;

    @ApiProperty({
        description: 'Имя Фамилия сотрудника (из запроса).',
        example: 'Иван Петров',
    })
    name: string;

    @ApiProperty({
        description:
            'Фактические звонки и эфир за день; null — статистика звонков недоступна.',
        type: KpiDigestCallsDto,
        nullable: true,
    })
    calls: KpiDigestCallsDto | null;

    @ApiProperty({
        description:
            'События дня сотрудника (все действия) в хронологическом порядке.',
        type: [KpiDigestRecordDto],
    })
    records: KpiDigestRecordDto[];

    @ApiProperty({
        description:
            'Записи плана/переноса, запланированные на этот день ранее.',
        type: [KpiDigestRecordDto],
    })
    plannedAtStartRecords: KpiDigestRecordDto[];
}

/** Сводка по всем ответственным портала за день (база для «Ø все»). */
export class KpiDigestSummaryDto {
    @ApiProperty({
        description: 'Сотрудников портала с активностью/планом за день.',
        example: 18,
    })
    usersCount: number;

    @ApiProperty({
        description: 'Суммарные счётчики по всем сотрудникам портала.',
        type: KpiDigestCountersDto,
    })
    totals: KpiDigestCountersDto;

    @ApiProperty({
        description:
            'Суммарные звонки по всем сотрудникам; null — статистика недоступна.',
        type: KpiDigestCallsDto,
        nullable: true,
    })
    calls: KpiDigestCallsDto | null;

    @ApiProperty({
        description: 'Сотрудников портала со звонками за день.',
        example: 16,
    })
    callsUsersCount: number;
}

export class KpiDigestCatalogItemDto {
    @ApiProperty({
        description: "Код item'а без префикса списка.",
        example: 'xo',
    })
    code: string;

    @ApiProperty({
        description: 'Название с портала.',
        example: 'Холодный звонок',
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Группа типа (только для типов событий).',
        enum: KPI_DIGEST_TYPE_GROUPS,
        example: 'call',
    })
    group?: KpiDigestTypeGroup;
}

/** Справочники портала для подписей на фронте. */
export class KpiDigestCatalogDto {
    @ApiProperty({ type: [KpiDigestCatalogItemDto] })
    types: KpiDigestCatalogItemDto[];

    @ApiProperty({ type: [KpiDigestCatalogItemDto] })
    actions: KpiDigestCatalogItemDto[];

    @ApiProperty({ type: [KpiDigestCatalogItemDto] })
    noresultReasons: KpiDigestCatalogItemDto[];
}

export class KpiDigestPeriodDto {
    @ApiProperty({ enum: KPI_DIGEST_PERIOD_KINDS, example: 'day' })
    kind: KpiDigestPeriodKind;

    @ApiProperty({
        description: 'Начало периода, YYYY-MM-DD.',
        example: '2026-10-14',
    })
    from: string;

    @ApiProperty({
        description: 'Конец периода (включительно), YYYY-MM-DD.',
        example: '2026-10-14',
    })
    to: string;
}

export class KpiDigestReportDto {
    @ApiProperty({ type: KpiDigestPeriodDto })
    period: KpiDigestPeriodDto;

    @ApiProperty({
        description: 'Момент формирования, ISO.',
        example: '2026-10-14T15:00:00.000Z',
    })
    generatedAt: string;

    @ApiProperty({ type: KpiDigestCatalogDto })
    catalog: KpiDigestCatalogDto;

    @ApiProperty({
        description: 'ID списка sales_kpi в Битриксе — для ссылок на элементы.',
        example: '55',
    })
    listId: string;

    @ApiProperty({
        description: 'Строки по запрошенным сотрудникам.',
        type: [KpiDigestEmployeeDto],
    })
    employees: KpiDigestEmployeeDto[];

    @ApiProperty({ type: KpiDigestSummaryDto })
    summary: KpiDigestSummaryDto;

    @ApiProperty({
        description:
            'Некритичные проблемы сборки (например, звонки недоступны).',
        type: [String],
        example: [],
    })
    warnings: string[];

    @ApiProperty({
        description:
            'Какая-то из партиций обрезана по лимиту строк — данные неполные.',
        example: false,
    })
    truncated: boolean;

    @ApiProperty({
        description:
            'Презентации (сделки «ОП Презентации») и продажи дня; null — ' +
            'выборка сделок недоступна (причина в warnings).',
        type: KpiDigestPresentationsDto,
        nullable: true,
    })
    presentations: KpiDigestPresentationsDto | null;
}

/** Конверт POST /kpi-report/digest/get (режим очереди). */
export class KpiDigestResponseDto {
    @ApiProperty({
        description:
            'ready — дайджест готов (data); queued — считается, результат ' +
            'придёт WS-событием kpi-report:digest:done либо повторным POST; ' +
            'error — расчёт упал (message), повтор — forceRefresh.',
        enum: KPI_DIGEST_RESPONSE_STATUSES,
        example: 'ready',
    })
    status: KpiDigestResponseStatus;

    @ApiPropertyOptional({ type: KpiDigestReportDto })
    data?: KpiDigestReportDto;

    @ApiPropertyOptional({
        description:
            'Эхо ключа запроса `day|{date}|{date}|{sortedUserIds}` для матчинга WS/поллинга.',
        type: String,
        example: 'day|2026-10-14|2026-10-14|12_34',
    })
    requestKey?: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки расчёта (status error).',
        type: String,
    })
    message?: string;
}
