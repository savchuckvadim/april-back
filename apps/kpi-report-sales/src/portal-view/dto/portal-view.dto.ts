import { ApiProperty } from '@nestjs/swagger';
import {
    REPORT_VIEW_COMMON_TAB_NAMES,
    REPORT_VIEW_LABEL_LIMITS,
    REPORT_VIEW_PLAN_COLUMN_CODES,
    REPORT_VIEW_TAB_CODES,
    type ReportViewPlanColumnCode,
    type ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import {
    PORTAL_VIEW_BADGE_GROUPS,
    PORTAL_VIEW_INDICATOR_GROUPS,
    type PortalViewBadgeGroup,
    type PortalViewIndicatorGroup,
} from '../portal-view.const';
import type {
    PortalViewBadgeOption,
    PortalViewIndicator,
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
            'Свои названия показателей портала: ключ — «ev:» и код события ' +
            'отчёта, «call:» и бакет звонков, «plan:» и код планового ' +
            'показателя; значение — название для показа (до ' +
            `${REPORT_VIEW_LABEL_LIMITS.nameLength} знаков). Данные отчёта ` +
            'не меняются: название подставляется при показе. Пустой объект ' +
            '— свои названия не заданы.',
        type: 'object',
        additionalProperties: {
            type: 'string',
            maxLength: REPORT_VIEW_LABEL_LIMITS.nameLength,
        },
        example: {
            'ev:presentation_plan': 'Назначенная презентация',
            'plan:calls_done': 'План',
        },
    })
    labels: Record<string, string>;

    @ApiProperty({
        description:
            'Колонки планов на вкладках «Все» и «События»: включено — ' +
            'вплотную перед показателем с настроенным планом стоит колонка ' +
            'плана сотрудника на выбранный период, в таблице и в Excel ' +
            '(основные листы).',
        type: Boolean,
        example: false,
    })
    plansEvents: boolean;

    @ApiProperty({
        description:
            'Колонки планов в «Объединённом отчёте»: включено — колонка ' +
            'плана перед своим показателем, в таблице и в Excel.',
        type: Boolean,
        example: false,
    })
    plansMerged: boolean;

    @ApiProperty({
        description:
            'Колонки планов на вкладке «Звонки»: включено — колонка плана ' +
            'перед своим бакетом звонков. Только в интерфейсе: Excel ' +
            'вкладки «Звонки» выгружает таблицу событий.',
        type: Boolean,
        example: false,
    })
    plansCallings: boolean;

    @ApiProperty({
        description:
            'Коды плановых показателей, чью колонку плана не выводить, даже ' +
            'если колонки планов включены. Без дублей и неизвестных кодов; ' +
            'пусто — выводятся все включённые в настройках планов.',
        type: String,
        isArray: true,
        enum: [...REPORT_VIEW_PLAN_COLUMN_CODES],
        example: ['sales_count'],
    })
    planColumnsHidden: ReportViewPlanColumnCode[];

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

/** Показатель отчёта, которому можно задать своё название. */
export class PortalViewIndicatorDto implements PortalViewIndicator {
    @ApiProperty({
        description:
            'Ключ своего названия показателя: «ev:» и код события отчёта, ' +
            '«call:» и бакет звонков, «plan:» и код планового показателя. ' +
            'Его же присылают в своих названиях при сохранении.',
        type: String,
        example: 'ev:presentation_plan',
    })
    key: string;

    @ApiProperty({
        description:
            'Группа на странице настроек: events — колонки таблицы событий, ' +
            'callings — бакеты звонков, plans — колонки планов.',
        type: String,
        enum: [...PORTAL_VIEW_INDICATOR_GROUPS],
        example: 'events',
    })
    group: PortalViewIndicatorGroup;

    @ApiProperty({
        description:
            'Исходное название показателя, как в отчёте (лишние пробелы ' +
            'убраны): его показывают рядом с полем своего названия. У ' +
            'колонки плана — название планового показателя по умолчанию.',
        type: String,
        example: 'План Презентация',
    })
    name: string;

    @ApiProperty({
        description:
            'У колонки плана — ключ показателя-факта, перед которым она ' +
            'стоит («ev:presentation_done», «call:30»); у событий и звонков ' +
            '— null.',
        type: String,
        nullable: true,
        example: 'ev:presentation_done',
    })
    factKey: string | null;
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

    @ApiProperty({
        description:
            'Каталог показателей портала: колонки событий в порядке отчёта ' +
            '(сначала «План» и «Результативные»), бакеты звонков, затем ' +
            'плановые показатели, чей факт есть среди событий и звонков ' +
            'портала. Ключи своих названий принимаются только из этого ' +
            'списка.',
        type: [PortalViewIndicatorDto],
    })
    indicators: PortalViewIndicatorDto[];
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
        description:
            'Варианты для страницы настроек: вкладки, бейджи и показатели ' +
            'отчёта для своих названий и колонок планов.',
        type: PortalViewOptionsDto,
    })
    options: PortalViewOptionsDto;
}
