import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsEnum,
    IsString,
    ValidateNested,
    IsNumber,
    IsOptional,
    IsNotEmpty,
} from 'class-validator';
import { IExcelReport } from '../types/excel-report.type';
import { DateRangeDto } from '../../shared/dto/kpi.dto';

export enum EDownloadType {
    EXCEL = 'excel',
    PDF = 'pdf',
}
export class DownloadReportKpiItemDto {
    @ApiProperty({ description: 'KPI ID' })
    @IsOptional()
    @IsString()
    id?: string;

    @ApiProperty({ description: 'KPI action' })
    @IsString()
    action: string;

    @ApiProperty({ description: 'KPI count' })
    @IsNumber()
    @IsOptional()
    count: number;
}

export class DownloadKpiReportItemDto implements IExcelReport {
    @ApiProperty({ description: 'Report ID - user id' })
    @IsNotEmpty()
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'User name' })
    @IsString()
    userName: string;

    @ApiProperty({
        description: 'KPI data',
        type: DownloadReportKpiItemDto,
        isArray: true,
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DownloadReportKpiItemDto)
    kpi: DownloadReportKpiItemDto[];
}

export class ReportStructureGroupDto {
    @ApiProperty({ description: 'ID группы (отдела Bitrix)' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Название группы' })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'ID сотрудников группы из report',
        type: [Number],
    })
    @IsArray()
    @IsNumber({}, { each: true })
    userIds: number[];
}

export class ReportStructureDepartmentDto {
    @ApiProperty({ description: 'ID отдела продаж (отдела Bitrix)' })
    @IsNumber()
    id: number;

    @ApiProperty({ description: 'Название отдела' })
    @IsString()
    name: string;

    @ApiProperty({
        description: 'Группы отдела',
        type: [ReportStructureGroupDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportStructureGroupDto)
    groups: ReportStructureGroupDto[];

    @ApiProperty({
        description: 'ID сотрудников отдела вне групп из report',
        type: [Number],
    })
    @IsArray()
    @IsNumber({}, { each: true })
    userIds: number[];
}

export class ReportStructureDto {
    @ApiProperty({ description: 'Мультипортал (несколько ОП)' })
    @IsNotEmpty()
    isMultiple: boolean;

    @ApiProperty({
        description: 'Отделы продаж с группировкой сотрудников',
        type: [ReportStructureDepartmentDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ReportStructureDepartmentDto)
    departments: ReportStructureDepartmentDto[];
}

export class ConversionsExcelRowDto {
    @ApiProperty({ description: 'ФИО менеджера' })
    @IsString()
    userName: string;

    @ApiProperty({
        description:
            'Доли конверсии по шагам (0.25 = 25%), null — знаменатель 0 (рендер «—»)',
        type: 'array',
        items: { type: 'number', nullable: true },
    })
    @IsArray()
    values: (number | null)[];
}

/**
 * Секция листа «Конверсии» — отдел или группа. Считает фронт (итог
 * секции — из сумм числителей/знаменателей, НЕ среднее процентов),
 * бэк только рендерит блок с заголовком и своим «Итого».
 */
export class ConversionsExcelSectionDto {
    @ApiProperty({ description: 'Заголовок секции (отдел / группа)' })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Строки менеджеров секции',
        type: [ConversionsExcelRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConversionsExcelRowDto)
    rows: ConversionsExcelRowDto[];

    @ApiProperty({
        description: 'Итог секции (доли из сумм числителей/знаменателей)',
        type: 'array',
        items: { type: 'number', nullable: true },
    })
    @IsArray()
    total: (number | null)[];
}

export class ConversionsExcelDto {
    @ApiProperty({
        description: 'Способ расчёта: «Цепочка — к предыдущему» и т.п.',
    })
    @IsString()
    methodLabel: string;

    @ApiProperty({
        description: 'Тип отчёта, из которого выгружены конверсии (для подписи листа)',
        required: false,
    })
    @IsOptional()
    @IsString()
    reportTypeLabel?: string;

    @ApiProperty({
        description: 'Заголовки шагов («Звонки → Презентации»)',
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    columns: string[];

    @ApiProperty({
        description: 'Строки конверсий по менеджерам',
        type: [ConversionsExcelRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConversionsExcelRowDto)
    rows: ConversionsExcelRowDto[];

    @ApiProperty({
        description: 'Командный итог (доли из сумм числителей/знаменателей)',
        type: 'array',
        items: { type: 'number', nullable: true },
    })
    @IsArray()
    total: (number | null)[];

    @ApiProperty({
        description:
            'Разбивка по отделам/группам (мульти — отделы и группы с ' +
            'префиксом отдела, моно — группы); не передана — только сводная',
        type: [ConversionsExcelSectionDto],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConversionsExcelSectionDto)
    sections?: ConversionsExcelSectionDto[];
}

/** Ячейка листа «Планы»: план/факт/достижение одного показателя. */
export class PlansExcelCellDto {
    @ApiProperty({
        description: 'План на выбранный период (пересчитан фронтом); null — не задан',
        type: Number,
        nullable: true,
    })
    plan: number | null;

    @ApiProperty({ description: 'Факт за выбранный период', type: Number })
    fact: number;

    @ApiProperty({
        description: 'Достижение (0.84 = 84%); null — план не задан',
        type: Number,
        nullable: true,
    })
    percent: number | null;
}

export class PlansExcelRowDto {
    @ApiProperty({ description: 'ФИО менеджера (или название секции-итога)' })
    @IsString()
    userName: string;

    @ApiProperty({
        description: 'Ячейки по показателям (порядок = columns)',
        type: [PlansExcelCellDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlansExcelCellDto)
    cells: PlansExcelCellDto[];
}

/** Секция листа «Планы» — отдел или группа (агрегаты считает фронт). */
export class PlansExcelSectionDto {
    @ApiProperty({ description: 'Заголовок секции (отдел / группа)' })
    @IsString()
    title: string;

    @ApiProperty({ description: 'Строки менеджеров секции', type: [PlansExcelRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlansExcelRowDto)
    rows: PlansExcelRowDto[];

    @ApiProperty({ description: 'Итог секции (Σ планов и фактов)', type: [PlansExcelCellDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlansExcelCellDto)
    total: PlansExcelCellDto[];
}

/** План одного показателя для подстроки «— план» главной таблицы. */
export class PlanMainCellDto {
    @ApiProperty({ description: 'innerCode показателя kpi-отчёта' })
    @IsString()
    code: string;

    @ApiProperty({ description: 'План на выбранный период', type: Number })
    @IsNumber()
    plan: number;
}

export class PlanMainRowDto {
    @ApiProperty({ description: 'Bitrix ID сотрудника' })
    @IsNumber()
    userId: number;

    @ApiProperty({
        description: 'Планы по показателям главной таблицы',
        type: [PlanMainCellDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanMainCellDto)
    cells: PlanMainCellDto[];
}

/**
 * Планы руководителя для Excel: лист «Планы» (план/факт/% по включённым
 * показателям; рядовой сотрудник получает только свою строку — фильтрует
 * фронт) + опц. подстроки «— план» главной таблицы (mainRows — только
 * когда показ планов включён в отчёте). Всё считает фронт, бэк рендерит.
 */
export class PlansExcelDto {
    @ApiProperty({
        description: 'Названия включённых показателей (custom/default)',
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    columns: string[];

    @ApiProperty({
        description:
            'Единицы показателей (порядок = columns): count | money | minutes — numFmt',
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    units: string[];

    @ApiProperty({ description: 'Строки сводной таблицы', type: [PlansExcelRowDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlansExcelRowDto)
    rows: PlansExcelRowDto[];

    @ApiProperty({ description: 'Итог по всем строкам', type: [PlansExcelCellDto] })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlansExcelCellDto)
    total: PlansExcelCellDto[];

    @ApiProperty({
        description: 'Разбивка по отделам/группам (как у конверсий)',
        type: [PlansExcelSectionDto],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlansExcelSectionDto)
    sections?: PlansExcelSectionDto[];

    @ApiProperty({
        description:
            'Планы для подстрок «— план» главной таблицы (только при включённом показе планов)',
        type: [PlanMainRowDto],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PlanMainRowDto)
    mainRows?: PlanMainRowDto[];
}

/** Денежные итоги финансового листа (сотрудник / секция / всего). */
export class FinanceExcelTotalsDto {
    @ApiProperty({ description: 'Число сделок' })
    @IsNumber()
    dealsCount: number;

    @ApiProperty({ description: 'Аванс (Σ оплат), руб.' })
    @IsNumber()
    advanceAmount: number;

    @ApiProperty({ description: 'Оплаченные месяцы' })
    @IsNumber()
    paidMonths: number;

    @ApiProperty({ description: 'Абонентская сумма в месяц, руб.' })
    @IsNumber()
    monthlyAmount: number;

    @ApiProperty({ description: 'Количество (шт. по строкам товаров)' })
    @IsNumber()
    quantity: number;

    @ApiProperty({ description: 'Ожидаемая сумма по договорам, руб.' })
    @IsNumber()
    expectedContractAmount: number;
}

export class FinanceExcelEmployeeRowDto {
    @ApiProperty({ description: 'ФИО сотрудника' })
    @IsString()
    name: string;

    @ApiProperty({ description: 'Итоги сотрудника', type: FinanceExcelTotalsDto })
    @ValidateNested()
    @Type(() => FinanceExcelTotalsDto)
    totals: FinanceExcelTotalsDto;
}

/** Секция финансового листа — отдел или группа (агрегаты считает фронт). */
export class FinanceExcelSectionDto {
    @ApiProperty({ description: 'Заголовок секции (отдел / группа)' })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Строки сотрудников секции',
        type: [FinanceExcelEmployeeRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FinanceExcelEmployeeRowDto)
    rows: FinanceExcelEmployeeRowDto[];

    @ApiProperty({ description: 'Итог секции', type: FinanceExcelTotalsDto })
    @ValidateNested()
    @Type(() => FinanceExcelTotalsDto)
    total: FinanceExcelTotalsDto;
}

/** Сделка детализации финансового листа (закрытая или горячая). */
export class FinanceExcelDealRowDto {
    @ApiProperty({ description: 'ФИО ответственного' })
    @IsString()
    employeeName: string;

    @ApiProperty({ description: 'Название сделки' })
    @IsString()
    title: string;

    @ApiProperty({
        description: 'Дата закрытия (закрытые) / стадия (горячие)',
    })
    @IsString()
    statusLabel: string;

    @ApiProperty({ description: 'Компания', type: String, nullable: true })
    @IsOptional()
    @IsString()
    companyName: string | null;

    @ApiProperty({ description: 'Тип клиента', type: String, nullable: true })
    @IsOptional()
    @IsString()
    clientTypeName: string | null;

    @ApiProperty({ description: 'Тип договора', type: String, nullable: true })
    @IsOptional()
    @IsString()
    contractTypeName: string | null;

    @ApiProperty({
        description: 'Действие договора с (дд.мм.гггг)',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    contractStart: string | null;

    @ApiProperty({
        description: 'Действие договора по (дд.мм.гггг)',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    contractEnd: string | null;

    @ApiProperty({ description: 'Абонентская сумма в месяц, руб.' })
    @IsNumber()
    monthlyAmount: number;

    @ApiProperty({ description: 'Аванс, руб.' })
    @IsNumber()
    advanceAmount: number;

    @ApiProperty({ description: 'Оплаченные месяцы' })
    @IsNumber()
    paidMonths: number;

    @ApiProperty({ description: 'Количество, шт.' })
    @IsNumber()
    quantity: number;

    @ApiProperty({ description: 'Ожидаемая сумма по договору, руб.' })
    @IsNumber()
    expectedContractAmount: number;
}

/** Блок «Продажи» вкладки «Финансы» (закрытые в успех сделки). */
export class FinanceClosedExcelDto {
    @ApiProperty({ description: 'Общие итоги', type: FinanceExcelTotalsDto })
    @ValidateNested()
    @Type(() => FinanceExcelTotalsDto)
    totals: FinanceExcelTotalsDto;

    @ApiProperty({
        description: 'Свод по сотрудникам',
        type: [FinanceExcelEmployeeRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FinanceExcelEmployeeRowDto)
    rows: FinanceExcelEmployeeRowDto[];

    @ApiProperty({
        description: 'Разбивка по отделам/группам (как у конверсий)',
        type: [FinanceExcelSectionDto],
        required: false,
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FinanceExcelSectionDto)
    sections?: FinanceExcelSectionDto[];

    @ApiProperty({
        description: 'Детализация по сделкам',
        type: [FinanceExcelDealRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FinanceExcelDealRowDto)
    deals: FinanceExcelDealRowDto[];
}

/** Блок «Горячие клиенты» вкладки «Финансы» (открытые сделки от порога). */
export class FinanceHotExcelDto {
    @ApiProperty({ description: 'Подпись порога («от Презентации» и т.п.)' })
    @IsString()
    thresholdLabel: string;

    @ApiProperty({ description: 'Итоги', type: FinanceExcelTotalsDto })
    @ValidateNested()
    @Type(() => FinanceExcelTotalsDto)
    totals: FinanceExcelTotalsDto;

    @ApiProperty({
        description: 'Открытые сделки (statusLabel = стадия)',
        type: [FinanceExcelDealRowDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => FinanceExcelDealRowDto)
    deals: FinanceExcelDealRowDto[];
}

/**
 * Финансовая вкладка для Excel (ЗЕРКАЛО UI): передаются только видимые
 * блоки — скрыт тумблером/недоступен → соответствующего листа нет.
 * Все данные считает фронт из своего стора, бэк только рендерит.
 */
export class FinanceExcelDto {
    @ApiProperty({
        description: 'Блок «Продажи» (лист «Финансы — Продажи»)',
        type: FinanceClosedExcelDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => FinanceClosedExcelDto)
    closed?: FinanceClosedExcelDto;

    @ApiProperty({
        description: 'Блок «Горячие клиенты» (лист «Финансы — Горячие»)',
        type: FinanceHotExcelDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => FinanceHotExcelDto)
    hot?: FinanceHotExcelDto;
}

export class DownLoadKpiReportDto {
    @ApiProperty({ description: 'Download type', enum: EDownloadType })
    @IsEnum(EDownloadType)
    type: EDownloadType;

    @ApiProperty({
        description: 'Report data',
        type: [DownloadKpiReportItemDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DownloadKpiReportItemDto)
    report: DownloadKpiReportItemDto[];

    @ApiProperty({ description: 'Date range', type: DateRangeDto })
    @ValidateNested()
    @Type(() => DateRangeDto)
    @IsNotEmpty()
    date: DateRangeDto;

    @ApiProperty({
        description:
            'Структура отделов/групп для разбивки: мульти — лист на отдел с секциями групп, моно с группами — лист «По группам». Не передана — прежний одиночный лист.',
        type: ReportStructureDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ReportStructureDto)
    structure?: ReportStructureDto;

    @ApiProperty({
        description:
            'Конверсии между показателями (лист «Конверсии»); считает фронт, не передана — листа нет.',
        type: ConversionsExcelDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ConversionsExcelDto)
    conversions?: ConversionsExcelDto;

    @ApiProperty({
        description:
            'Планы руководителя (лист «Планы» + подстроки главной таблицы); ' +
            'считает фронт, не передана — листа нет.',
        type: PlansExcelDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => PlansExcelDto)
    plans?: PlansExcelDto;

    @ApiProperty({
        description:
            'Финансовая вкладка (листы «Финансы — Продажи» / «Финансы — Горячие»); ' +
            'передаётся ТОЛЬКО когда вкладка «Финансы» видима в отчёте — ' +
            'Excel зеркалит UI.',
        type: FinanceExcelDto,
        required: false,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => FinanceExcelDto)
    finance?: FinanceExcelDto;
}
