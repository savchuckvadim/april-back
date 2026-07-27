import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    SALES_FINANCE_RESPONSE_STATUSES,
    SalesFinanceResponseStatus,
} from '../constants/sales-finance.const';

/**
 * Финансовые показатели одной сделки, закрытой в успех.
 */
export class ClosedSalesDealDto {
    @ApiProperty({
        description: 'ID сделки Bitrix24 (для ссылки на портал).',
        type: Number,
        example: 1024,
    })
    id: number;

    @ApiProperty({
        description: 'Название сделки.',
        type: String,
        example: 'ООО Ромашка — Гарант',
    })
    title: string;

    @ApiProperty({
        description: 'ID ответственного (ASSIGNED_BY_ID).',
        type: Number,
        example: 123,
    })
    assignedId: number;

    @ApiProperty({
        description: 'Дата закрытия сделки (CLOSEDATE), ISO.',
        type: String,
        example: '2026-03-15T10:00:00+03:00',
    })
    closeDate: string;

    @ApiProperty({
        description: 'Сумма сделки (OPPORTUNITY).',
        type: Number,
        example: 144000,
    })
    opportunity: number;

    @ApiProperty({
        description:
            'Аванс (предоплата): деньги, которые уже в сделке — ' +
            'Σ цена × количество по товарным строкам.',
        type: Number,
        example: 144000,
    })
    advanceAmount: number;

    @ApiProperty({
        description:
            'Оплачено месяцев: Σ количество × коэффициент из единицы измерения ' +
            '(например «лиц.12мес.» → 12).',
        type: Number,
        example: 12,
    })
    paidMonths: number;

    @ApiProperty({
        description:
            'Сумма сделки, приведённая к одному месяцу: Σ (сумма строки / месяцы строки).',
        type: Number,
        example: 12000,
    })
    monthlyAmount: number;

    @ApiProperty({
        description:
            'Количество товара (Σ количество по товарным строкам, без коэффициентов).',
        type: Number,
        example: 1,
    })
    quantity: number;

    @ApiProperty({
        description:
            'Дата начала действия договора (поле contract_start), ISO; null, если не заполнена.',
        type: String,
        nullable: true,
        example: '2026-03-01',
    })
    contractStart: string | null;

    @ApiProperty({
        description:
            'Дата окончания действия договора (поле contract_end), ISO; null, если не заполнена.',
        type: String,
        nullable: true,
        example: '2027-02-28',
    })
    contractEnd: string | null;

    @ApiProperty({
        description:
            'Длительность договора в месяцах (по датам с/по, округление по половине месяца).',
        type: Number,
        example: 12,
    })
    contractMonths: number;

    @ApiProperty({
        description:
            'Код типа договора (enum-элемент pbx-поля contract_type, ' +
            'items per-portal); null — не задан/поле не настроено.',
        type: String,
        nullable: true,
        example: 'garant_standart',
    })
    contractTypeCode: string | null;

    @ApiProperty({
        description:
            'Ожидаемая сумма за весь договор: месячная сумма × месяцы договора.',
        type: Number,
        example: 144000,
    })
    expectedContractAmount: number;

    @ApiProperty({
        description:
            'ID компании сделки (COMPANY_ID); null, если компания не привязана.',
        type: Number,
        nullable: true,
        example: 512,
    })
    companyId: number | null;

    @ApiProperty({
        description:
            'Название компании сделки (TITLE); null, если компания не привязана.',
        type: String,
        nullable: true,
        example: 'ООО Ромашка',
    })
    companyName: string | null;

    @ApiProperty({
        description:
            'Перспектива компании (pbx op_prospects, code = цвет: green/yellow/red…); null — не задана.',
        type: String,
        nullable: true,
        example: 'green',
    })
    companyColor: string | null;

    @ApiProperty({
        description:
            'Тип клиента компании (pbx op_client_type: state/commerc/ip/fiz/layer); null — не задан.',
        type: String,
        nullable: true,
        example: 'commerc',
    })
    companyClientType: string | null;
}

/**
 * Агрегированные финансовые показатели (по сотруднику или итого).
 */
export class ClosedSalesTotalsDto {
    @ApiProperty({
        description: 'Количество сделок.',
        type: Number,
        example: 7,
    })
    dealsCount: number;

    @ApiProperty({
        description: 'Σ аванса по сделкам.',
        type: Number,
        example: 1008000,
    })
    advanceAmount: number;

    @ApiProperty({
        description: 'Σ оплаченных месяцев по сделкам.',
        type: Number,
        example: 84,
    })
    paidMonths: number;

    @ApiProperty({
        description: 'Σ месячных сумм по сделкам.',
        type: Number,
        example: 84000,
    })
    monthlyAmount: number;

    @ApiProperty({
        description: 'Σ количества товара по сделкам.',
        type: Number,
        example: 7,
    })
    quantity: number;

    @ApiProperty({
        description: 'Σ ожидаемых сумм за договор по сделкам.',
        type: Number,
        example: 1008000,
    })
    expectedContractAmount: number;
}

/**
 * Финансовые показатели одного сотрудника с детализацией по сделкам.
 */
export class ClosedSalesEmployeeDto extends ClosedSalesTotalsDto {
    @ApiProperty({
        description: 'ID сотрудника (ASSIGNED_BY_ID).',
        type: Number,
        example: 123,
    })
    assignedId: number;

    @ApiProperty({
        description: 'Сделки сотрудника, закрытые в успех за период.',
        type: [ClosedSalesDealDto],
    })
    deals: ClosedSalesDealDto[];
}

/**
 * Готовый финансовый отчёт по закрытым продажам.
 */
export class ClosedSalesReportDto {
    @ApiProperty({
        description: 'Показатели по каждому сотруднику.',
        type: [ClosedSalesEmployeeDto],
    })
    employees: ClosedSalesEmployeeDto[];

    @ApiProperty({
        description: 'Итоги по всем сотрудникам.',
        type: ClosedSalesTotalsDto,
    })
    totals: ClosedSalesTotalsDto;

    @ApiProperty({
        description: 'Начало периода отчёта, ISO-дата.',
        type: String,
        example: '2026-01-01',
    })
    dateFrom: string;

    @ApiProperty({
        description: 'Конец периода отчёта, ISO-дата.',
        type: String,
        example: '2026-06-30',
    })
    dateTo: string;

    @ApiProperty({
        description: 'Момент формирования отчёта, ISO.',
        type: String,
        example: '2026-07-24T12:00:00.000Z',
    })
    generatedAt: string;
}

/**
 * Ответ эндпоинта закрытых продаж: готовые данные из кэша
 * либо признак постановки в очередь (результат придёт по WS).
 */
export class ClosedSalesResponseDto {
    @ApiProperty({
        description:
            'Статус: ready — данные в поле data; queued — отчёт считается в очереди, ' +
            'результат придёт по WS на socketId.',
        enum: SALES_FINANCE_RESPONSE_STATUSES,
        example: 'ready',
    })
    status: SalesFinanceResponseStatus;

    @ApiPropertyOptional({
        description: 'Готовый отчёт (только при status = ready).',
        type: ClosedSalesReportDto,
    })
    data?: ClosedSalesReportDto;
}
