import { PBX_DEAL_SALES_BASE_STAGE_CODE } from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
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

/**
 * Часть реестра: определения событий, бюджеты AI-контура и стоимость
 * (решения владельца А.1, А.2, А.6). Собирается в `registry.const.ts`.
 */
export const AI_ANALYTICS_DEFINITION_PARAMS = [
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
        defaultValue: 'green,yellow,red,none',
        phase: 2,
        breaksSeries: false,
        description:
            'Светофор компании (поле «ОП Прогноз работы») — атрибут разреза hotByColor и необязательный фильтр; по умолчанию входят все значения, включая не установленное (none).',
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
