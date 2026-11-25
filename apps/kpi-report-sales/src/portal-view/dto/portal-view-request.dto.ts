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
    REPORT_VIEW_TAB_CODES,
    type ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import { AiRequestBaseDto } from '../../ai-analytics/dto/ai-request-base.dto';
import {
    PORTAL_VIEW_BADGE_ID_PATTERN,
    PORTAL_VIEW_LIMITS,
    PORTAL_VIEW_MESSAGES,
} from '../portal-view.const';
import type { PortalViewChanges } from '../portal-view.types';

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
            'заменяется). Пустой список — показывать все вкладки. Вкладку ' +
            `«Все» скрыть нельзя. Не больше ${PORTAL_VIEW_LIMITS.tabs} кодов.`,
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
}
