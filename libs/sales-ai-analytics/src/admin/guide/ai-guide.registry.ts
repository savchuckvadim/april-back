/**
 * Связь путеводителя с реестрами: тематические группы параметров,
 * названия полей настроек конвейера портала и категория ключа kpiSales.
 * Чистые функции без DI — ими пользуются контроллер и спека каталога.
 */
import {
    EnumPortalAppCode,
    PORTAL_APP_SETTINGS_SCHEMA,
    type PortalAppSettingDescriptor,
} from '@lib/portal-lib/store/app-settings/portal-app-settings.schema';
import {
    PORTAL_APP_SETTING_GROUPS,
    resolveAppSettingGroup,
    type PortalAppSettingGroupCode,
} from '@lib/portal-lib/store/app-settings/lib/app-setting-groups';
import { AI_ANALYTICS_DEFINITION_PARAMS } from '../../params/registry.definitions.const';
import { AI_ANALYTICS_DQ_PARAMS } from '../../params/registry.dq.const';
import { AI_ANALYTICS_EDGE_PARAMS } from '../../params/registry.edges.const';
import { AI_ANALYTICS_EXPOSURE_PARAMS } from '../../params/registry.exposure.const';
import { AI_ANALYTICS_FUNNEL_PARAMS } from '../../params/registry.funnel.const';
import { AI_ANALYTICS_NORM_PARAMS } from '../../params/registry.norms.const';
import { AI_ANALYTICS_PHASE4_ADVICE_PARAMS } from '../../params/registry.phase4-advice.const';
import { AI_ANALYTICS_PHASE4_PARAMS } from '../../params/registry.phase4.const';
import { AI_ANALYTICS_PLAN_PARAMS } from '../../params/registry.plan.const';
import { AI_ANALYTICS_POLICY_PARAMS } from '../../params/registry.policy.const';
import { AI_ANALYTICS_POOL_PARAMS } from '../../params/registry.pool.const';
import { AI_ANALYTICS_QUALITY_PARAMS } from '../../params/registry.quality.const';
import { AI_ANALYTICS_STYLE_PARAMS } from '../../params/registry.style.const';
import { AI_ANALYTICS_TENURE_PARAMS } from '../../params/registry.tenure.const';
import { AI_ANALYTICS_THRESHOLD_PARAMS } from '../../params/registry.thresholds.const';
import type { ParamDescriptor } from '../../params/registry.types';
import type { AiGuidePortalAiSettingField } from './ai-guide.types';

/**
 * Тематические группы реестра — зеркало файлов `params/registry.*.const.ts`.
 * Порядок = порядок показа в админке. Группы не дублируют реестр: внутри —
 * ссылки на те же массивы дескрипторов.
 */
/** Группа реестра: массив дескрипторов намеренно расширен до общего типа. */
interface AiGuideParamGroup {
    readonly title: string;
    readonly params: readonly ParamDescriptor[];
}

const group = (
    title: string,
    params: readonly ParamDescriptor[],
): AiGuideParamGroup => ({ title, params });

export const AI_GUIDE_PARAM_GROUPS = {
    thresholds: group('Пороги сигналов и чисел', AI_ANALYTICS_THRESHOLD_PARAMS),
    policy: group(
        'Политики: алерты, «Внимание», советы',
        AI_ANALYTICS_POLICY_PARAMS,
    ),
    definitions: group(
        'Определения событий и разбора',
        AI_ANALYTICS_DEFINITION_PARAMS,
    ),
    exposure: group(
        'Экспозиция: состав, календарь, отсутствия',
        AI_ANALYTICS_EXPOSURE_PARAMS,
    ),
    tenure: group('Стаж и уровни', AI_ANALYTICS_TENURE_PARAMS),
    plan: group('План дня и цели', AI_ANALYTICS_PLAN_PARAMS),
    norms: group('Нормы и усадка', AI_ANALYTICS_NORM_PARAMS),
    funnel: group('Воронка и цикл', AI_ANALYTICS_FUNNEL_PARAMS),
    edges: group('Рёбра воронки', AI_ANALYTICS_EDGE_PARAMS),
    quality: group(
        'Качество разговора и оценивание',
        AI_ANALYTICS_QUALITY_PARAMS,
    ),
    style: group('Стиль менеджера', AI_ANALYTICS_STYLE_PARAMS),
    dq: group('Качество данных и калибровка', AI_ANALYTICS_DQ_PARAMS),
    phase4: group(
        'Прогноз отдела и связь качества с результатом (Фаза 4)',
        AI_ANALYTICS_PHASE4_PARAMS,
    ),
    'phase4-advice': group(
        'Эффект советов (Фаза 4)',
        AI_ANALYTICS_PHASE4_ADVICE_PARAMS,
    ),
    pool: group('Пул порталов и эксперименты', AI_ANALYTICS_POOL_PARAMS),
} as const satisfies Record<string, AiGuideParamGroup>;

export type AiGuideParamGroupCode = keyof typeof AI_GUIDE_PARAM_GROUPS;

export const AI_GUIDE_PARAM_GROUP_CODES = Object.keys(
    AI_GUIDE_PARAM_GROUPS,
) as AiGuideParamGroupCode[];

export const isAiGuideParamGroupCode = (
    value: string,
): value is AiGuideParamGroupCode => value in AI_GUIDE_PARAM_GROUPS;

/** Группа без темы: код есть в реестре, но ни в одном тематическом файле. */
export const AI_GUIDE_PARAM_GROUP_OTHER = {
    code: 'other',
    title: 'Прочие параметры',
} as const;

const GROUP_BY_CODE: ReadonlyMap<string, AiGuideParamGroupCode> = new Map(
    AI_GUIDE_PARAM_GROUP_CODES.flatMap(group =>
        AI_GUIDE_PARAM_GROUPS[group].params.map(
            descriptor => [descriptor.code, group] as const,
        ),
    ),
);

/** Тематическая группа кода реестра и её название. */
export function aiGuideParamGroupOf(code: string): {
    code: string;
    title: string;
} {
    const group = GROUP_BY_CODE.get(code);
    return group
        ? { code: group, title: AI_GUIDE_PARAM_GROUPS[group].title }
        : AI_GUIDE_PARAM_GROUP_OTHER;
}

/**
 * Названия полей `portal_ai_settings` для путеводителя. Полнота карты
 * (каждое поле записи, кроме служебного lastScanAt) закреплена спекой —
 * новое поле конвейера без строки здесь уронит тест, а не пропадёт из
 * админки молча. Подробные описания живут в DTO и META фронта.
 */
export const AI_GUIDE_PORTAL_AI_SETTING_TITLES: Readonly<
    Record<AiGuidePortalAiSettingField, string>
> = {
    enabled: 'Обрабатывать звонки портала (главный выключатель конвейера)',
    deepAnalysisEnabled: 'Глубокий разбор (разделы, речь, оценки)',
    createSmartEnabled: 'Создавать элемент смарта «AI-анализ звонков»',
    classifyEnabled: 'Дешёвая классификация типа звонка',
    salesOnly: 'Только менеджеры отдела продаж',
    minDurationSec: 'Минимальная длительность звонка для разбора, сек',
    windowHours: 'Окно поиска звонков назад, часов',
    maxPerRun: 'Максимум звонков в очередь за один скан',
    staleMinutes: 'Порог реанимации зависших обработок, минут',
    llmModel: 'Модель первичного анализа (резюме и рекомендации)',
    deepAnalysisModel: 'Модель глубокого разбора',
    scanIntervalMinutes: 'Интервал сканирования днём, минут',
    nightScanIntervalMinutes: 'Интервал сканирования ночью, минут',
    nightStartHour: 'Начало ночного окна, час (МСК)',
    nightEndHour: 'Конец ночного окна, час (МСК)',
    allowedUserIds: 'Пилот: bitrix-id сотрудников, чьи звонки разбираются',
    irrelevantConfidence: 'Порог уверенности гейта нерелевантности (0..1)',
    revisorEnabled: 'Ночной ревизор по сделкам и лидам',
    presentationAuditEnabled: 'Утренняя сверка по презентациям',
    presentationStrictness:
        'Строгость определения презентации (strict / normal / soft)',
    weeklyReportEnabled: 'Недельный Excel-отчёт по звонкам',
    weeklyReportRecipients: 'Получатели недельного отчёта (bitrix-id)',
    weeklyReportFolderId: 'Папка Диска для недельного отчёта',
    weeklyReportDelivery: 'Доставка недельного отчёта (chat / task / notify)',
    complianceReviewEnabled: 'Проверка по документам компании после разбора',
    ownOrgNames: 'Свои названия организации на портале («это мы»)',
    llmProviderOrder:
        'Порядок провайдеров LLM для разборов портала (основной → запасные)',
    transcriptionMode:
        'Транскрибатор портала (авто / Яндекс / VibeCode / свой Whisper)',
    whisperBaseUrl: 'Адрес своего Whisper портала',
    whisperModel: 'Модель своего Whisper портала',
    whisperApiKey: 'Ключ своего Whisper портала (хранится зашифрованным)',
};

export interface AiGuideKpiSalesSetting {
    key: string;
    descriptor: PortalAppSettingDescriptor;
    group: PortalAppSettingGroupCode;
    groupTitle: string;
}

/** Дескриптор и категория ключа kpiSales по camelCase-ключу схемы; нет — null. */
export function findKpiSalesSetting(
    key: string,
): AiGuideKpiSalesSetting | null {
    const schema = PORTAL_APP_SETTINGS_SCHEMA[
        EnumPortalAppCode.kpiSales
    ] as Record<string, PortalAppSettingDescriptor>;
    const descriptor = schema[key];
    if (!descriptor) return null;
    const group = resolveAppSettingGroup(
        EnumPortalAppCode.kpiSales,
        descriptor.code,
    );
    return {
        key,
        descriptor,
        group,
        groupTitle: PORTAL_APP_SETTING_GROUPS[group].title,
    };
}
