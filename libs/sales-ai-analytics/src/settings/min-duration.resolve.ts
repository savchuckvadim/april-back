/**
 * Единый порог «разбираемого» звонка портала (решение владельца А.1,
 * план §14.5 п.1; аудит Фазы 2, находка M12).
 *
 * Порог — **только фильтр**: он отсекает звонки, которые не идут в разбор,
 * и никогда не назначает тип. Источник у всех контуров один: карта
 * определений портала `ai_analytics_definitions.minDurationSecByType` и код
 * реестра `min_duration_sec_by_type`, разрешённый с контекстом портала
 * (`buildRegistryContext` собирает те же слои, что конвейер получает в
 * `ctx.registry`). Иначе знаменатель пульса, набор разбираемых звонков
 * ночного конвейера и доля коротких в аудите Фазы 0 расходятся.
 *
 * Порядок источников (сверху вниз):
 * 1. ЯВНОЕ решение портала ПО ТИПАМ: карта `definitions.minDurationSecByType`
 *    либо код `min_duration_sec_by_type`, переопределённый в `model_params`;
 * 2. ЯВНЫЙ общий скаляр портала: код реестра `min_duration_sec` в
 *    `model_params` (проверяется реестром, как любой код: значение вне
 *    диапазона решением не считается);
 * 3. запасной скаляр `fallbackSec` — прежний `PortalAiSettings.minDurationSec`
 *    конвейера разбора (принимается как есть: это решение старой админки,
 *    и молча менять его реестром нельзя);
 * 4. дефолт реестра (`min_duration_sec_by_type`, 300 с).
 *
 * ⚠ Старшинство даёт именно ЯВНО заданный порог, а не сам факт заведённых
 * настроек AI-аналитики. Иначе портал, который завёл `ai_analytics_definitions`
 * ради другого поля (цвета «горячих», рёбра воронки) и держит в разборе
 * `minDurationSec = 60`, молча получил бы дефолт реестра 300 — и разбор
 * перестал бы брать звонки от минуты до пяти.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import { minDurationByType, type MinDurationSecByType } from '../model/pulse';
import { resolveNumberParam, resolveParam, type ParamContext } from '../params';
import { parseAiDefinitions, parseAiModelParams } from './ai-settings.parse';
import type { AiModelParams, AiPortalDefinitions } from './ai-settings.types';
import {
    AI_DEFINITION_PARAM_CODES,
    buildRegistryContext,
} from './registry-context.builder';

/** Поле карты порогов в JSON `ai_analytics_definitions`. */
const DEFINITIONS_MIN_DURATION_KEY =
    'minDurationSecByType' satisfies keyof AiPortalDefinitions;

export interface PortalMinDurationInput {
    /** `ai_analytics_definitions` портала; undefined — ключ не заведён. */
    definitions?: AiPortalDefinitions;
    /** `ai_analytics_model_params` портала; undefined — ключ не заведён. */
    modelParams?: AiModelParams;
    /**
     * Прежний скаляр конвейера разбора (`PortalAiSettings.minDurationSec`).
     * Уступает только ЯВНО заданному порогу AI-аналитики (карта в
     * `definitions`, код `min_duration_sec_by_type` или скаляр
     * `min_duration_sec` в `model_params`); дефолт реестра его не вытесняет.
     */
    fallbackSec?: number | null;
    /**
     * Задал ли портал порог ПО ТИПАМ явно. Определить это по разобранным
     * настройкам нельзя: парсер подставляет дефолтную карту вместо
     * отсутствующего ключа, поэтому признак приходит из сырого JSON
     * (`isMinDurationPortalDefined`). `false` означает «ключи настроек
     * есть, но порога по типам среди них нет» — тогда работают скаляр
     * `min_duration_sec` из `model_params` и `fallbackSec`. undefined —
     * признак не считался: слой портала читается как есть.
     */
    portalDefined?: boolean;
}

/** Дефолт реестра для кода `min_duration_sec_by_type` (без слоёв портала). */
export function registryMinDurationSec(): number {
    return resolveNumberParam('min_duration_sec_by_type', {}) ?? 300;
}

/**
 * Явный общий скаляр портала — код реестра `min_duration_sec` из
 * `model_params`. Парсер дефолтов в `model_params` не подставляет, а слой
 * определений этот код не заполняет (только `min_duration_sec_by_type`),
 * поэтому источник `portal` у разрешённого значения — надёжный признак
 * решения человека. Дефолт реестра (источник `default`, в том числе после
 * отказа по диапазону или типу) решением портала не считается.
 */
function portalScalarSec(ctx: ParamContext): number | undefined {
    const resolved = resolveParam('min_duration_sec', ctx);

    return resolved.source === 'portal' && typeof resolved.value === 'number'
        ? resolved.value
        : undefined;
}

/**
 * Эффективная карта порогов портала: ключ `default` — порог для типов вне
 * карты и для звонка без типа, остальные ключи появляются, только когда
 * пороги по типам РАЗНЫЕ (одинаковые — это одно решение, и его владелец
 * реестр, см. `minDurationByType`).
 */
export function resolveMinDurationByType(
    input: PortalMinDurationInput = {},
): MinDurationSecByType {
    const hasSettings =
        input.definitions !== undefined || input.modelParams !== undefined;
    const ctx: ParamContext = hasSettings
        ? buildRegistryContext({
              definitions: input.definitions,
              modelParams: input.modelParams,
          })
        : {};
    // Слой портала ПО ТИПАМ читаем, только если порог в настройках
    // действительно задан: иначе «дефолт реестра, подставленный парсером»
    // вытеснил бы прежний скаляр разбора и молча поднял порог на живом
    // портале.
    const byTypeSec =
        hasSettings && input.portalDefined !== false
            ? resolveNumberParam('min_duration_sec_by_type', ctx)
            : undefined;

    const defaultSec =
        byTypeSec ??
        portalScalarSec(ctx) ??
        input.fallbackSec ??
        registryMinDurationSec();

    return minDurationByType(
        input.portalDefined === false
            ? undefined
            : input.definitions?.minDurationSecByType,
        defaultSec,
    );
}

/** Сырые значения ключей [kpiSales], как их отдаёт PortalAppSettingsService. */
export interface PortalMinDurationSettings {
    /** JSON `ai_analytics_definitions`; пусто — ключ на портале не заведён. */
    aiAnalyticsDefinitions?: string;
    /** JSON `ai_analytics_model_params`; пусто — ключ на портале не заведён. */
    aiAnalyticsModelParams?: string;
}

/** Есть ли ключ верхнего уровня в JSON настроек (без доверия его значению). */
function hasTopLevelKey(json: string, key: string): boolean {
    if (!json) return false;
    try {
        const parsed: unknown = JSON.parse(json);
        return (
            typeof parsed === 'object' &&
            parsed !== null &&
            key in (parsed as Record<string, unknown>)
        );
    } catch {
        // Битый JSON — портал ничего не решил, работают запасные источники.
        return false;
    }
}

/**
 * Задал ли портал порог ПО ТИПАМ явно: ключ `minDurationSecByType` в
 * `ai_analytics_definitions` или код `min_duration_sec_by_type` в
 * `ai_analytics_model_params` стоит в сыром JSON. Парсеры подставляют
 * дефолты, и по разобранным настройкам «портал задал 300» неотличимо от
 * «портал не задавал ничего» — поэтому признак считается только здесь.
 */
export function isMinDurationPortalDefined(
    settings: PortalMinDurationSettings | null | undefined,
): boolean {
    return (
        hasTopLevelKey(
            settings?.aiAnalyticsDefinitions?.trim() ?? '',
            DEFINITIONS_MIN_DURATION_KEY,
        ) ||
        hasTopLevelKey(
            settings?.aiAnalyticsModelParams?.trim() ?? '',
            AI_DEFINITION_PARAM_CODES.minDurationSecByType,
        )
    );
}

/**
 * Карта порогов по сырым настройкам портала: разбор JSON здесь, чтобы
 * приложения (event-sales, CLI и админ-ручка аудита) не повторяли связку
 * «парсер → контекст реестра → карта» каждое по-своему. Битый JSON даёт
 * дефолты кода (так устроены парсеры), пустой ключ — «портал не решал».
 */
export function minDurationByTypeOfSettings(
    settings: PortalMinDurationSettings | null | undefined,
    fallbackSec?: number | null,
): MinDurationSecByType {
    const definitionsJson = settings?.aiAnalyticsDefinitions?.trim() ?? '';
    const modelParamsJson = settings?.aiAnalyticsModelParams?.trim() ?? '';

    return resolveMinDurationByType({
        ...(definitionsJson
            ? { definitions: parseAiDefinitions(definitionsJson) }
            : {}),
        ...(modelParamsJson
            ? { modelParams: parseAiModelParams(modelParamsJson) }
            : {}),
        fallbackSec,
        portalDefined: isMinDurationPortalDefined(settings),
    });
}

/**
 * Минимум по карте порогов — значение для ЭТАПОВ, ГДЕ ТИП ЗВОНКА ЕЩЁ НЕ
 * ИЗВЕСТЕН (выборка звонков из Битрикса до классификации, доля коротких в
 * аудите Фазы 0). Звонок короче минимума не проходит порог ни одного типа,
 * поэтому фильтр по минимуму ничего лишнего не отрезает; окончательный
 * отсев по типу делается позже, когда тип определён.
 */
export function minDurationFloorSec(byType: MinDurationSecByType): number {
    const values = Object.values(byType);

    return values.length > 0 ? Math.min(...values) : registryMinDurationSec();
}
