import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsIn,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
} from 'class-validator';
import {
    REPORT_VIEW_COMMON_TAB_NAMES,
    REPORT_VIEW_PLAN_COLUMN_CODES,
    REPORT_VIEW_TAB_CODES,
    type ReportViewPlanColumnCode,
    type ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import { AiRequestBaseDto } from '../../ai-analytics/dto/ai-request-base.dto';
import {
    PORTAL_VIEW_BADGE_ID_PATTERN,
    PORTAL_VIEW_LIMITS,
    PORTAL_VIEW_MESSAGES,
} from '../portal-view.const';
import type { PortalViewChanges } from '../portal-view.types';
import { IsReportViewLabels } from './report-view-labels.validator';

/** Запрос вида отчёта портала: домен и пользователь, от имени которого читают. */
export class PortalViewGetRequestDto extends AiRequestBaseDto {}

/**
 * Запрос сохранения вида отчёта. Меняются только переданные поля; не
 * переданное остаётся как было. Менять может руководитель группы и выше.
 */
export class PortalViewSaveRequestDto
    extends AiRequestBaseDto
    implements PortalViewChanges
{
    @ApiPropertyOptional({
        description:
            'Коды вкладок, которые скрыть у всех на портале (весь список ' +
            'заменяется). Пустой список — показывать все вкладки. Скрыть ' +
            'сразу все вкладки, которые видят все сотрудники ' +
            `(${REPORT_VIEW_COMMON_TAB_NAMES}), нельзя: хотя бы одна из них ` +
            `остаётся. Не больше ${PORTAL_VIEW_LIMITS.tabs} кодов.`,
        type: String,
        isArray: true,
        enum: [...REPORT_VIEW_TAB_CODES],
        maxItems: PORTAL_VIEW_LIMITS.tabs,
        example: ['merged', 'finance'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(PORTAL_VIEW_LIMITS.tabs)
    @IsString({ each: true })
    @IsIn(REPORT_VIEW_TAB_CODES, {
        each: true,
        message: PORTAL_VIEW_MESSAGES.unknownTab,
    })
    tabsHidden?: ReportViewTabCode[];

    @ApiPropertyOptional({
        description:
            'Показывать ли графики в отчёте у всех на портале. false — ' +
            'остаются таблицы.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    chartsEnabled?: boolean;

    @ApiPropertyOptional({
        description:
            'Идентификаторы основных бейджей списка «Разборы звонков» в ' +
            'порядке показа (весь список заменяется): общий бейдж — его id ' +
            'из справочника, пункт методики — «m:» и код пункта. Пустой ' +
            'список — набор по умолчанию. Повторы отбрасываются, неизвестный ' +
            `общий бейдж — ошибка. Не больше ${PORTAL_VIEW_LIMITS.badges} ` +
            'бейджей.',
        type: [String],
        maxItems: PORTAL_VIEW_LIMITS.badges,
        example: ['step_missing', 'signal', 'm:cold.utp_unique'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(PORTAL_VIEW_LIMITS.badges)
    @IsString({ each: true })
    @MaxLength(PORTAL_VIEW_LIMITS.badgeIdLength, { each: true })
    @Matches(PORTAL_VIEW_BADGE_ID_PATTERN, {
        each: true,
        message: PORTAL_VIEW_MESSAGES.badgePattern,
    })
    badgesMain?: string[];

    @ApiPropertyOptional({
        description:
            'Свои названия показателей (весь набор заменяется): ключ — «ev:» ' +
            'и код события, «call:» и бакет звонков, «plan:» и код планового ' +
            'показателя, только из каталога показателей портала ' +
            '(options.indicators), иначе ошибка; значение — название до ' +
            `${PORTAL_VIEW_LIMITS.labelLength} знаков, пробелы по краям ` +
            'обрезаются. Пустая строка убирает своё название показателя, ' +
            'пустой объект сбрасывает все. Не больше ' +
            `${PORTAL_VIEW_LIMITS.labels} записей.`,
        type: 'object',
        additionalProperties: {
            type: 'string',
            maxLength: PORTAL_VIEW_LIMITS.labelLength,
        },
        example: {
            'ev:presentation_plan': 'Назначенная презентация',
            'call:30': 'Разговоры от 30 с',
            'plan:calls_done': 'План',
        },
    })
    @IsOptional()
    @IsReportViewLabels()
    labels?: Record<string, string>;

    @ApiPropertyOptional({
        description:
            'Колонки планов на вкладках «Все» и «События» у всех на портале: ' +
            'true — колонка плана перед своим показателем, в таблице и Excel.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    plansEvents?: boolean;

    @ApiPropertyOptional({
        description:
            'Колонки планов в «Объединённом отчёте» у всех на портале: ' +
            'true — колонка плана перед своим показателем, в таблице и Excel.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    plansMerged?: boolean;

    @ApiPropertyOptional({
        description:
            'Колонки планов на вкладке «Звонки» у всех на портале: true — ' +
            'колонка плана перед своим бакетом звонков (только в интерфейсе).',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    plansCallings?: boolean;

    @ApiPropertyOptional({
        description:
            'Коды плановых показателей, чью колонку плана не выводить (весь ' +
            'список заменяется): только показатели с фактом в событиях или ' +
            'звонках. Пустой список — выводить все включённые в настройках ' +
            `планов. Повторы отбрасываются. Не больше ${PORTAL_VIEW_LIMITS.planColumns} ` +
            'кодов.',
        type: String,
        isArray: true,
        enum: [...REPORT_VIEW_PLAN_COLUMN_CODES],
        maxItems: PORTAL_VIEW_LIMITS.planColumns,
        example: ['sales_count'],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(PORTAL_VIEW_LIMITS.planColumns)
    @IsString({ each: true })
    @IsIn(REPORT_VIEW_PLAN_COLUMN_CODES, {
        each: true,
        message: PORTAL_VIEW_MESSAGES.unknownPlanColumn,
    })
    planColumnsHidden?: ReportViewPlanColumnCode[];
}
