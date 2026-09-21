import {
    PBX_DEAL_SALES_BASE_STAGES,
    PBX_DEAL_SALES_BASE_STAGE_CODE,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { PbxDealSalesBaseStageCode } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    AI_HOT_CLIENT_COLORS,
    AI_INVOICE_NESTINGS,
    AI_NORM_STRATA,
    AI_PRESENTATION_CANONS,
    AI_PRODUCTIVE_CALL_DEFINITIONS,
} from './registry.enums.const';
import type { ParamDescriptor } from './registry.types';

/** Префикс определения «горячего клиента» через стадию основной сделки. */
export const HOT_CLIENT_STAGE_FROM_PREFIX = 'stage_from:' as const;

/**
 * Определение «горячего клиента» по решению владельца А.2: стадия основной
 * сделки от «В решении» (order 8) и выше. Стадия — только из лестницы
 * PBX_DEAL_SALES_BASE_STAGES, никаких строковых литералов.
 */
export const HOT_CLIENT_DEFINITION_DEFAULT =
    `${HOT_CLIENT_STAGE_FROM_PREFIX}${PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress}` as const;

/** Коды стадий лестницы sales_base — словарь CSV-кода `decision_stages`. */
export const AI_SALES_BASE_STAGE_CODES: readonly PbxDealSalesBaseStageCode[] =
    PBX_DEAL_SALES_BASE_STAGES.map(stage => stage.code);

/**
 * Стадии «в решении» по умолчанию (план §2.1 `decision_stages`): подготовка
 * КП, отправка документов и «В решении» — только коды лестницы.
 */
export const AI_DECISION_STAGES_DEFAULT = [
    PBX_DEAL_SALES_BASE_STAGE_CODE.offerCreate,
    PBX_DEAL_SALES_BASE_STAGE_CODE.documentSend,
    PBX_DEAL_SALES_BASE_STAGE_CODE.inProgress,
] as const satisfies readonly PbxDealSalesBaseStageCode[];

/**
 * Часть реестра: определения событий (что считать звонком, презентацией,
 * счётом, «горячим»), бюджеты AI-контура и стоимость (решения владельца
 * А.1, А.2, А.6). Смена определения меняет смысл ряда, поэтому у кодов
 * определений §2.1 стоит `breaksSeries`. Собирается в `registry.const.ts`.
 */
export const AI_ANALYTICS_DEFINITION_PARAMS = [
    {
        code: 'min_duration_sec',
        title: 'Минимальная длительность звонка для разбора',
        scope: 'portal',
        source: 'configured',
        unit: 'секунд',
        defaultValue: 300,
        range: [60, 600],
        phase: 0,
        breaksSeries: true,
        description:
            'Общий порог конвейера разбора для всех типов: звонок короче в разбор не идёт и остаётся вне слоя качества. Читает resolveMinDurationByType: явное значение в ai_analytics_model_params старше прежнего скаляра PortalAiSettings.minDurationSec, а порог по типу (min_duration_sec_by_type) старше обоих.',
    },
    {
        code: 'min_duration_sec_by_type',
        title: 'Минимальная длительность разбираемого звонка по типу',
        scope: 'portal',
        source: 'configured',
        unit: 'секунд',
        defaultValue: 300,
        range: [30, 600],
        phase: 2,
        breaksSeries: true,
        description:
            'Решение владельца А.1: порог только отсекает звонки, которые идут в разбор, и никогда не назначает тип — тип даёт классификатор с приором CRM (холодный бывает длиннее презентации). Один и тот же параметр читают конвейер и пульс; смена порога рвёт сравнимость рядов качества.',
    },
    {
        code: 'productive_call_definition',
        title: 'Что считать результативным звонком',
        scope: 'portal',
        source: 'configured',
        unit: 'код определения',
        defaultValue: 'kpi_done',
        phase: 1,
        breaksSeries: true,
        kind: 'enum',
        enumValues: AI_PRODUCTIVE_CALL_DEFINITIONS,
        description:
            'KPI-факт «сделано» (kpi_done), статус результата ОП из справочника KPI-списка, порог длительности (duration_ge) или дата следующего шага из разбора (ai_next_step_date — пульс). Смена определения меняет знаменатель E1 и сдвигает comparableFrom.',
    },
    {
        code: 'presentation_canon',
        title: 'Канон презентации',
        scope: 'portal',
        source: 'configured',
        unit: 'код KPI-факта',
        defaultValue: 'presentation_uniq_done',
        phase: 1,
        breaksSeries: true,
        kind: 'enum',
        enumValues: AI_PRESENTATION_CANONS,
        description:
            'Какой факт считается презентацией в рёбрах E1, E2, E3, E5 и гейтах готовности: уникальная презентация (по умолчанию), любая презентация или только подтверждённая. Смена канона рвёт сравнимость рядов воронки.',
    },
    {
        code: 'presentation_confirmed_only',
        title: 'Считать только подтверждённые презентации',
        scope: 'portal',
        source: 'configured',
        unit: 'флаг',
        defaultValue: false,
        phase: 1,
        breaksSeries: true,
        description:
            'Тумблер канона презентации (анкета Ж, presentation_canon): при включении в числитель E1 и знаменатели E2, E3, E5 идут только презентации, подтверждённые разбором; санити требует доли confirmed/uniq не ниже 0,6. Смена рвёт сравнимость рядов.',
    },
    {
        code: 'invoice_nesting',
        title: 'Вложенность счетов после презентации в счета',
        scope: 'portal',
        source: 'configured',
        unit: 'код вложенности',
        defaultValue: 'disjoint',
        phase: 1,
        breaksSeries: true,
        kind: 'enum',
        enumValues: AI_INVOICE_NESTINGS,
        description:
            'disjoint — «счёт после презентации» и «счёт» считаются раздельно, nested — первый вложен во второй; от этого зависит знаменатель E4 «счёт → продажа», поэтому смена рвёт сравнимость ряда.',
    },
    {
        code: 'call_done_includes_site_come_call',
        title: 'Входят ли звонки с сайта в call_done',
        scope: 'portal',
        source: 'configured',
        unit: 'флаг',
        defaultValue: false,
        phase: 1,
        breaksSeries: true,
        description:
            'Считать ли site/come_call частью call_done и знаменателя E1 «звонок → презентация». По умолчанию нет — как считает витрина; включение меняет знаменатель и рвёт сравнимость ряда.',
    },
    {
        code: 'decision_stages',
        title: 'Стадии «в решении»',
        scope: 'portal',
        source: 'configured',
        unit: 'коды стадий sales_base через запятую',
        defaultValue: AI_DECISION_STAGES_DEFAULT.join(','),
        phase: 1,
        breaksSeries: false,
        kind: 'csv',
        enumValues: AI_SALES_BASE_STAGE_CODES,
        description:
            'Стадии основной сделки, которые подвкладка «В решении» и пайплайн считают решающимися: по умолчанию подготовка КП, отправка документов и «В решении». Только коды лестницы PBX_DEAL_SALES_BASE_STAGES; разрез, а не определение — ряд не рвёт.',
    },
    {
        code: 'norm_stratum',
        title: 'Слой стратификации норм',
        scope: 'portal',
        source: 'configured',
        unit: 'код слоя',
        defaultValue: 'tenure',
        phase: 2,
        breaksSeries: false,
        kind: 'enum',
        enumValues: AI_NORM_STRATA,
        description:
            'По чему стратифицировать нормы и capacity: по полосе стажа из since (по умолчанию) или по уровню, назначенному руководителем (override админа). Уровень делает норму junior средним слабых, поэтому стаж — базовый выбор.',
    },
    {
        code: 'hot_client_definition',
        title: 'Определение «горячего клиента»',
        scope: 'portal',
        source: 'configured',
        unit: 'правило «stage_from:<код стадии>»',
        defaultValue: HOT_CLIENT_DEFINITION_DEFAULT,
        phase: 2,
        breaksSeries: false,
        description:
            'Решение владельца А.2: горячий — сделка на стадии «В решении» (order 8) и выше. Данные берутся из того же HotClientsUseCase, что и вкладка «Финансы», отдельной ручки в AI-аналитике нет.',
    },
    {
        code: 'hot_client_colors',
        title: 'Цвета компании, попадающие в срез горячих',
        scope: 'portal',
        source: 'configured',
        unit: 'коды цветов через запятую',
        defaultValue: AI_HOT_CLIENT_COLORS.join(','),
        phase: 2,
        breaksSeries: false,
        kind: 'csv',
        enumValues: AI_HOT_CLIENT_COLORS,
        description:
            'Светофор компании (поле «ОП Прогноз работы») — атрибут разреза hotByColor и необязательный фильтр; по умолчанию входят все значения, включая не установленное (none).',
    },
    {
        code: 'company_color_field',
        title: 'Поле цвета компании',
        scope: 'portal',
        source: 'configured',
        unit: 'код UF-поля компании',
        defaultValue: '',
        phase: 3,
        breaksSeries: false,
        description:
            'Резерв под портал с другим полем светофора компании: пустая строка означает поле «ОП Прогноз работы» из PortalModel, иное значение — код UF-поля, из которого берётся цвет для разреза hotByColor.',
    },
    {
        code: 'brief_quota_per_day',
        title: 'Квота AI-резюме на менеджера в день',
        scope: 'portal',
        source: 'configured',
        unit: 'резюме в день',
        defaultValue: 5,
        range: [0, 50],
        phase: 2,
        breaksSeries: false,
        description:
            'Верхняя граница вызовов LLM для блока brief: расход считается по фактическим токенам и пишется в ais.tokens_count/price на 100 % вызовов.',
    },
    {
        code: 'llm_price_per_1k',
        title: 'Цена 1 000 токенов LLM',
        scope: 'portal',
        source: 'configured',
        unit: '₽ за 1 000 токенов',
        defaultValue: 0,
        range: [0, 1000],
        phase: 2,
        breaksSeries: false,
        description:
            'Решение владельца А.6: стоимость контура считается по факту, цена берётся из настроек портала или провайдера; ноль означает «цена не задана» и в отчёте показывается только расход токенов.',
    },
    {
        code: 'retest_budget_calls',
        title: 'Квота LLM test-retest на смену версии',
        scope: 'global',
        source: 'configured',
        unit: 'разборов',
        defaultValue: 300,
        range: [100, 1000],
        phase: 3,
        breaksSeries: false,
        description:
            'При каждой смене промпта, рубрики, реестра или модели два прогона на этой выборке дают σ_llm и ICC(2,1); гейт проходит без участия людей, иначе сдвигается comparableFrom.',
    },
] as const satisfies readonly ParamDescriptor[];
