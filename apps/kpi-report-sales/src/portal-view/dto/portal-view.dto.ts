import { ApiProperty } from '@nestjs/swagger';
import {
    REPORT_VIEW_COMMON_TAB_NAMES,
    REPORT_VIEW_TAB_CODES,
    type ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import {
    PORTAL_VIEW_BADGE_GROUPS,
    type PortalViewBadgeGroup,
} from '../portal-view.const';
import type {
    PortalViewBadgeOption,
    PortalViewMethodologyInfo,
    PortalViewOptions,
    PortalViewState,
    PortalViewTabOption,
} from '../portal-view.types';

/** Вид отчёта портала: то, что видят все пользователи портала. */
export class PortalViewStateDto implements PortalViewState {
    @ApiProperty({
        description:
            'Коды вкладок отчёта, скрытых у всех на портале. Без дублей и ' +
            'неизвестных кодов; пусто — видны все вкладки, доступные по ' +
            `правам. Хотя бы одна из вкладок ${REPORT_VIEW_COMMON_TAB_NAMES} ` +
            'всегда остаётся видимой.',
        type: String,
        isArray: true,
        enum: [...REPORT_VIEW_TAB_CODES],
        example: ['merged', 'finance'],
    })
    tabsHidden: ReportViewTabCode[];

    @ApiProperty({
        description:
            'Показывать ли графики в отчёте. Выключено — остаются таблицы. ' +
            'На телефоне графики скрыты всегда, независимо от настройки.',
        type: Boolean,
        example: true,
    })
    chartsEnabled: boolean;

    @ApiProperty({
        description:
            'Идентификаторы основных бейджей списка «Разборы звонков» в ' +
            'порядке показа: общий бейдж — его id, пункт методики — «m:» и ' +
            'код пункта. Пусто — набор по умолчанию (основные из справочника ' +
            'и отмеченные в методике).',
        type: [String],
        example: ['step_missing', 'signal', 'm:cold.utp_unique'],
    })
    badgesMain: string[];

    @ApiProperty({
        description:
            'Кто менял настройки последним, «Фамилия Имя»; null — настройки ' +
            'не меняли.',
        type: String,
        nullable: true,
        example: 'Иванов Пётр',
    })
    updatedBy: string | null;

    @ApiProperty({
        description:
            'Когда настройки меняли последний раз (ISO 8601, UTC); null — ' +
            'не меняли.',
        type: String,
        nullable: true,
        example: '2026-11-25T09:30:00.000Z',
    })
    updatedAt: string | null;
}

/** Вкладка, которую можно скрыть. */
export class PortalViewTabOptionDto implements PortalViewTabOption {
    @ApiProperty({
        description: 'Код вкладки — его же присылают в списке скрытых вкладок.',
        type: String,
        enum: [...REPORT_VIEW_TAB_CODES],
        example: 'call_reviews',
    })
    code: string;

    @ApiProperty({
        description: 'Название вкладки, как оно показано в отчёте.',
        type: String,
        example: 'Разборы звонков',
    })
    name: string;

    @ApiProperty({
        description:
            `Вкладку видят все сотрудники портала (${REPORT_VIEW_COMMON_TAB_NAMES}); ` +
            'остальные показываются по правам. Хотя бы одна такая вкладка ' +
            'должна оставаться видимой: последнюю из них скрыть нельзя.',
        type: Boolean,
        example: false,
    })
    common: boolean;
}

/** Вариант бейджа для списка основных: общий бейдж или пункт методики портала. */
export class PortalViewBadgeOptionDto implements PortalViewBadgeOption {
    @ApiProperty({
        description:
            'Идентификатор бейджа: у общего — его id из справочника, у пункта ' +
            'методики — «m:» и код пункта. Его же присылают в списке основных.',
        type: String,
        example: 'm:cold.utp_unique',
    })
    id: string;

    @ApiProperty({
        description: 'Подпись плашки бейджа, как её видит пользователь.',
        type: String,
        example: 'УТП: уникальность',
    })
    title: string;

    @ApiProperty({
        description:
            'Подсказка к бейджу: у общего — пояснение из справочника, у пункта ' +
            'методики — полная формулировка пункта; null — подсказки нет.',
        type: String,
        nullable: true,
        example: 'Менеджер назвал, чем компания отличается от других.',
    })
    hint: string | null;

    @ApiProperty({
        description:
            'Откуда бейдж: общий справочник или пункт методики портала.',
        type: String,
        enum: [...PORTAL_VIEW_BADGE_GROUPS],
        example: 'methodology',
    })
    group: PortalViewBadgeGroup;

    @ApiProperty({
        description:
            'Типы звонка, к которым относится пункт методики; у общих бейджей — ' +
            'пустой список.',
        type: [String],
        example: ['cold'],
    })
    callTypes: string[];

    @ApiProperty({
        description:
            'Основной ли бейдж по умолчанию: у общего — отметка справочника, ' +
            'у пункта — отметка в методике. Действует, пока портал не выбрал ' +
            'свой набор.',
        type: Boolean,
        example: false,
    })
    mainByDefault: boolean;
}

/** Действующая методика портала. */
export class PortalViewMethodologyDto implements PortalViewMethodologyInfo {
    @ApiProperty({
        description: 'Код методики портала.',
        type: String,
        example: 'polyansky',
    })
    code: string;

    @ApiProperty({
        description: 'Название методики для людей.',
        type: String,
        example: 'Методика Полянского',
    })
    title: string;
}

/** Что можно выбрать на странице «Настройки отчёта». */
export class PortalViewOptionsDto implements PortalViewOptions {
    @ApiProperty({
        description: 'Вкладки отчёта, которые можно скрыть.',
        type: [PortalViewTabOptionDto],
    })
    tabs: PortalViewTabOptionDto[];

    @ApiProperty({
        description:
            'Бейджи, из которых выбирают основные: сначала общие из ' +
            'справочника, затем пункты методики портала.',
        type: [PortalViewBadgeOptionDto],
    })
    badges: PortalViewBadgeOptionDto[];

    @ApiProperty({
        description:
            'Действующая методика портала, чьи пункты есть среди бейджей; ' +
            'null — методики нет, пунктов в списке нет.',
        type: PortalViewMethodologyDto,
        nullable: true,
    })
    methodology: PortalViewMethodologyDto | null;
}

/** Ответ ручек «Настройки отчёта»: состояние, права, ссылка поддержки и варианты. */
export class PortalViewResponseDto {
    @ApiProperty({
        description:
            'Вид отчёта портала. После сохранения — состояние уже после записи.',
        type: PortalViewStateDto,
    })
    view: PortalViewStateDto;

    @ApiProperty({
        description:
            'Может ли пользователь менять настройки: руководитель группы и ' +
            'выше или суперпользователь. Читать настройки может любой.',
        type: Boolean,
        example: false,
    })
    canEdit: boolean;

    @ApiProperty({
        description:
            'Ссылка на чат поддержки для кнопки в шапке «Отчёта»; null — ' +
            'ссылка не задана, кнопки нет.',
        type: String,
        nullable: true,
        example: 'https://april-dev.bitrix24.ru/online/support',
    })
    supportUrl: string | null;

    @ApiProperty({
        description: 'Варианты для страницы настроек: вкладки и бейджи.',
        type: PortalViewOptionsDto,
    })
    options: PortalViewOptionsDto;
}
