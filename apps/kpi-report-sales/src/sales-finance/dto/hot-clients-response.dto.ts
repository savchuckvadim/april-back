import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    SALES_FINANCE_RESPONSE_STATUSES,
    SALES_HOT_THRESHOLDS,
    SalesFinanceResponseStatus,
    SalesHotThreshold,
} from '../constants/sales-finance.const';

/**
 * Открытая «горячая» сделка с финансовыми показателями.
 */
export class HotClientDealDto {
    @ApiProperty({
        description: 'ID сделки Bitrix24 — для перехода по ссылке в сделку.',
        type: Number,
        example: 2048,
    })
    id: number;

    @ApiProperty({
        description: 'Название сделки.',
        type: String,
        example: 'ООО Лютик — Гарант',
    })
    title: string;

    @ApiProperty({
        description: 'ID ответственного (ASSIGNED_BY_ID).',
        type: Number,
        example: 123,
    })
    assignedId: number;

    @ApiProperty({
        description: 'Код стадии воронки (из лестницы sales_base).',
        type: String,
        example: 'sales_offer_create',
    })
    stageCode: string;

    @ApiProperty({
        description: 'Название стадии на портале.',
        type: String,
        example: 'Документы',
    })
    stageName: string;

    @ApiProperty({
        description: 'Сумма сделки (OPPORTUNITY).',
        type: Number,
        example: 144000,
    })
    opportunity: number;

    @ApiProperty({
        description: 'Σ цена × количество по товарным строкам сделки.',
        type: Number,
        example: 144000,
    })
    productRowsAmount: number;

    @ApiProperty({
        description:
            'Сумма товарных строк, приведённая к одному месяцу: ' +
            'Σ (сумма строки / месяцы строки по единице измерения).',
        type: Number,
        example: 12000,
    })
    monthlyAmount: number;

    @ApiProperty({
        description:
            'Потенциально оплаченных месяцев: Σ количество × коэффициент ' +
            'из единицы измерения (сколько месяцев закроется при выигрыше).',
        type: Number,
        example: 12,
    })
    paidMonths: number;

    @ApiProperty({
        description:
            'Количество товара (Σ количество по товарным строкам, без коэффициентов).',
        type: Number,
        example: 1,
    })
    quantity: number;

    @ApiProperty({
        description:
            'Дата начала действия договора (pbx contract_start), ISO; null — не заполнена.',
        type: String,
        nullable: true,
        example: '2026-03-01',
    })
    contractStart: string | null;

    @ApiProperty({
        description:
            'Дата окончания действия договора (pbx contract_end), ISO; null — не заполнена.',
        type: String,
        nullable: true,
        example: '2027-02-28',
    })
    contractEnd: string | null;

    @ApiProperty({
        description:
            'Код типа договора (XML_ID элемента живого словаря; bx_<ID> для ' +
            'элементов без XML_ID); null — не задан/поле не настроено.',
        type: String,
        nullable: true,
        example: 'garant_standart',
    })
    contractTypeCode: string | null;

    @ApiProperty({
        description:
            'Название типа договора (VALUE живого словаря — включает типы, ' +
            'добавленные на портале руками); null — не задан.',
        type: String,
        nullable: true,
        example: 'Интернет-версия',
    })
    contractTypeName: string | null;

    @ApiProperty({
        description: 'Значения поля «ОП История» (op_history).',
        type: [String],
        example: ['12.05 Презентация проведена', '20.05 КП отправлено'],
    })
    opHistory: string[];

    @ApiProperty({
        description:
            'Значения multiple-поля «ОП История (Комментарии)» (op_mhistory); ' +
            'пустой массив — не заполнено/поле не настроено.',
        type: [String],
        example: ['12.05 клиент попросил перезвонить'],
    })
    opMHistory: string[];

    @ApiProperty({
        description: 'Комментарии презентаций (поле pres_comments).',
        type: [String],
        example: ['Клиент просит скидку'],
    })
    comments: string[];

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
        example: 'ООО Лютик',
    })
    companyName: string | null;

    @ApiProperty({
        description:
            'Перспектива компании (pbx op_prospects, code = цвет: green/yellow/red…); null — не задана.',
        type: String,
        nullable: true,
        example: 'yellow',
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
 * Итоги по списку горячих клиентов.
 */
export class HotClientsTotalsDto {
    @ApiProperty({
        description: 'Количество открытых сделок в списке.',
        type: Number,
        example: 12,
    })
    dealsCount: number;

    @ApiProperty({
        description: 'Σ сумм сделок (OPPORTUNITY).',
        type: Number,
        example: 1728000,
    })
    opportunityTotal: number;

    @ApiProperty({
        description: 'Σ сумм товарных строк.',
        type: Number,
        example: 1728000,
    })
    productRowsAmountTotal: number;

    @ApiProperty({
        description: 'Σ месячных сумм.',
        type: Number,
        example: 144000,
    })
    monthlyAmountTotal: number;

    @ApiProperty({
        description: 'Σ потенциально оплаченных месяцев.',
        type: Number,
        example: 144,
    })
    paidMonthsTotal: number;

    @ApiProperty({
        description: 'Σ количества товара.',
        type: Number,
        example: 12,
    })
    quantityTotal: number;
}

/**
 * Готовый список горячих клиентов.
 */
export class HotClientsReportDto {
    @ApiProperty({
        description: 'Открытые сделки от пороговой стадии и выше.',
        type: [HotClientDealDto],
    })
    deals: HotClientDealDto[];

    @ApiProperty({
        description: 'Итоги по списку.',
        type: HotClientsTotalsDto,
    })
    totals: HotClientsTotalsDto;

    @ApiProperty({
        description: 'Использованный порог воронки.',
        enum: SALES_HOT_THRESHOLDS,
        example: 'document',
    })
    threshold: SalesHotThreshold;

    @ApiProperty({
        description: 'Момент формирования списка, ISO.',
        type: String,
        example: '2026-07-24T12:00:00.000Z',
    })
    generatedAt: string;
}

/**
 * Ответ эндпоинта горячих клиентов: данные из кэша либо постановка в очередь.
 */
export class HotClientsResponseDto {
    @ApiProperty({
        description:
            'Статус: ready — данные в поле data; queued — список считается в очереди, ' +
            'результат придёт по WS на socketId.',
        enum: SALES_FINANCE_RESPONSE_STATUSES,
        example: 'ready',
    })
    status: SalesFinanceResponseStatus;

    @ApiPropertyOptional({
        description: 'Готовый список (только при status = ready).',
        type: HotClientsReportDto,
    })
    data?: HotClientsReportDto;
}
