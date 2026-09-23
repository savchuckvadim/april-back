export * from './model/thresholds.const';
export * from './model/wilson';
export * from './model/metric';
export * from './model/xmr';
export * from './model/workdays.util';
export * from './model/sections.util';
export * from './model/pulse';
export * from './model/agenda';
export * from './model/morning-digest';

// Фаза 1b «модель и матрица»: усадка, корзины, матрица менеджер × тип,
// срез возражений, шаблон объяснения, «Внимание».
export * from './model/gamma';
export * from './model/shrink';
export * from './model/metric-pct.util';
export * from './model/buckets';
export * from './model/matrix.types';
export * from './model/matrix-cell';
export * from './model/manager-type-matrix';
export * from './model/objections';
export * from './model/explanation-template';
export * from './model/attention.types';
export * from './model/attention.rules';
export * from './model/attention';

export * from './contracts/versions.types';
export * from './contracts/feedback.types';
export * from './contracts/snapshot.types';
export * from './contracts/audit-snapshot.types';

// Аудит данных (Фаза 0): оркестратор, Prisma-адаптер, типы отчёта и
// календарь окна. Разбор CLI-аргументов и расчёты — по глубоким путям
// (audit/ai-analytics-audit.cli и т.д.), приложениям они не нужны.
export * from './audit/ai-analytics-audit.run';
export * from './audit/ai-analytics-audit.db';
export * from './audit/ai-analytics-audit.time';
export type {
    AuditDb,
    AuditAiDepth,
    AuditAiRow,
    AuditTranscriptionRow,
} from './audit/ai-analytics-audit.load';
export type {
    AuditReport,
    AuditReportMeta,
} from './audit/ai-analytics-audit.report';
export {
    AI_ANALYTICS_AUDIT_ABOUT,
    renderAuditAboutMarkdown,
    renderAuditAboutSummary,
} from './audit/ai-analytics-audit.about';
export type {
    AiAnalyticsAuditAbout,
    AiAnalyticsAuditAboutItem,
    AiAnalyticsAuditAboutSection,
} from './audit/ai-analytics-audit.about';

// Nest-слой аудита: сервисный модуль (стор снапшотов + сервис) и админ-модуль
// (только для apps/admin). Сервисы — через модули, не напрямую.
export { SalesAiAnalyticsAuditModule } from './admin/sales-ai-analytics-audit.module';
export { SalesAiAnalyticsAdminModule } from './admin/sales-ai-analytics-admin.module';
// Эксплуатация AI-аналитики (Фаза 3, П5): сервисный модуль без
// контроллеров (очередь конвейера, состояние прогонов, ретенция, расход
// модели, обратная связь, золотой набор) и отдельный модуль крона
// ретенции — его подключают ТОЛЬКО там, где поднят ScheduleModule.
export { SalesAiAnalyticsOpsModule } from './admin/sales-ai-analytics-ops.module';
export { SalesAiAnalyticsRetentionCronModule } from './admin/sales-ai-analytics-retention-cron.module';
export type {
    AiAnalyticsAuditPortalStatus,
    AiAnalyticsAuditResult,
    AiAnalyticsAuditRunOptions,
} from './admin/ai-analytics-audit.service';
// Проба истории стадий портала (вопрос владельцу A6): сервисный модуль
// поверх PBXModule — подключать ТОЛЬКО через SalesAiAnalyticsAdminModule
// (apps/admin), в kpi-report-sales не импортировать.
export { SalesAiAnalyticsProbeModule } from './admin/sales-ai-analytics-probe.module';
export { StageHistoryProbeService } from './admin/stage-history-probe.service';
export type { StageHistoryProbeResult } from './admin/stage-history-probe.service';
export type {
    AiAnalyticsAuditSnapshotInput,
    AiAnalyticsAuditSnapshotRecord,
} from './admin/ai-analytics-audit-snapshot.store';

// Фаза 2 «модель»: реестр параметров и послойный resolve (params/),
// типы и реестр снапшотов ais, нормы (экспозиция, κ, leave-one-out,
// апостериоры рёбер, сверхдисперсия φ и темп активности) и качество за
// период (усадка разделов, надёжность, потолки оценивания, применимость).
// Потребители — ночной конвейер и ручки Фазы 2 в apps/kpi-report-sales.
export * from './params';
export * from './contracts/snapshot-kinds.const';
export * from './contracts/snapshot-descriptors.const';
export * from './model/norms.index';
export * from './model/quality.index';

// Фаза 2, волна 2 «связь качества с исходом и рычаги»: контракт QualityLink
// (режимы betaSource none|hypothesis|data), детерминированный PRNG, кривая
// p̂(S) и её обращение, множитель качества и обратная задача, калькулятор
// гипотезы «что если», мощность и счётчик до гейта β, разложение разрыва
// воронки с перестановочной проверкой, отбор рычагов и уровни доказательности.
// К ручкам не подключено: чистая математика, потребители — Фазы 2–4.
export * from './contracts/quality-link.types';
export * from './model/prng';
export * from './model/quality-curve';
export * from './model/qav';
export * from './model/beta-hypothesis';
export * from './model/beta-power';
export * from './model/funnel-gap';
export * from './model/funnel-gap-permutation';
export * from './model/recommend';
export * from './model/evidence';

// Фаза 2, волна 2 «готовность и ядро AI-резюме»: единственный источник
// правил режимов витрины (buildReadiness) и правило показа одного числа,
// строгий контракт резюме (схема, лимиты, стоп-слова), сборка пакета фактов,
// общая нормализация чисел, факт-чек и шаблонный откат без LLM.
// Ручка brief появится в следующих волнах — здесь только модель.
export * from './model/readiness';
export * from './model/readiness-confidence';
export * from './model/readiness-window';
export * from './contracts/ai-brief.contract';
export * from './model/brief-pack';
export * from './model/brief-numbers';
export * from './model/brief-factcheck';
export * from './model/brief-template';

// Фаза 2, волна 2 «настройки портала»: типы и лимиты десяти ключей
// [kpiSales], дефолты из реестра параметров, парсеры «битый JSON → дефолт»,
// блокирующая проверка значений, правило сдвига сравнимой истории и сборка
// контекста реестра (портал → полоса стажа → менеджер).
// Единственный подключённый к ручке кусок Фазы 2 — settings/save.
export * from './settings/ai-settings.types';
export * from './settings/ai-settings.defaults';
export * from './settings/ai-settings.parse';
export * from './settings/ai-settings.sanity';
export * from './settings/ai-settings.series';
export * from './settings/registry-context.builder';
export * from './settings/min-duration.resolve';

// Фаза 2, волна 1 (добор) «потолки, применимость и стиль»: потолки оценок
// и стоп-фразы правил `ai_analytics_scoring` и таблица применимости «тип
// звонка × раздел рубрики» едут через барель качества (model/quality.index
// выше); здесь — профиль стиля менеджера (оси, leave-one-out норма
// коллег, усадка к τ, подписи с гистерезисом — вместо ярлыков).
export * from './model/style-axes.const';
export * from './model/style-tags.const';
export * from './model/style-profile.types';
export * from './model/style-shrink';
export * from './model/style-axis';
export * from './model/style-profile';

// Фаза 2, волна 1 (добор) «эпизоды сделки»: разбиение истории стадий на
// эпизоды (продвижение / провал / цензура), сцепка звонков с эпизодами
// (прямой путь, лид → сделка, запасной по компании и контакту), стадийные
// θ с усадкой, факты сроков и лаги продаж, выбор трактовки ребра
// (интенсивность ↔ вероятность, гистерезис 80/70) и плацебо-тест меток
// времени. Формы Битрикс сюда не проникают: на входе уже переходы стадий.
export * from './model/episode';
export * from './model/episode-link';
export * from './model/stage-theta';
export * from './model/edge-estimand';
export * from './model/timestamp-audit';

// Фаза 2, волна 1 (добор) «прогноз и план дня»: распределение лага
// «презентация → оплата» F(d) (cure-шкала, Каплан–Мейер), ожидание от
// пайплайна и нового потока, потолок полосы стажа (квантиль дневного темпа
// с гейтом), каскад цели, ramp по стажу и обратная задача плана на день
// (разворот по путям, связующее ограничение, бюджет времени, потолок).
export * from './model/quantile.util';
export * from './model/lag-cdf';
export * from './model/forecast';
export * from './model/capacity';
export * from './model/target';
export * from './model/ramp';
export * from './model/daily-plan';

// Фаза 2, волна 4 «паспорт менеджера и три звонка недели»: полосы стажа
// (границы кода реестра tenure_gates, стаж в месяцах, подсказка уровня) и
// детерминированный подбор трёх звонков недели для слепой проверки РОПа
// (неуверенный тип, лучший балл, случайный; PRNG от seedOf(domain, weekKey),
// не более одного звонка на менеджера). Контракты ManagerPassport и
// PlanSnapshot уже доступны из contracts/snapshot.types.
export * from './model/tenure-bands';
export * from './model/norms-backtest';
export * from './model/rop-mark';

// Фаза 3, поток П7 «test-retest языковой модели»: каппа Коэна (номинальная,
// взвешенная, PABAK), ICC(2,1)/(3,1) по двухфакторной ANOVA, TOST на
// эквивалентность средних, F1 по множествам возражений и сводка пар
// разборов → GoldenReport (контракт снапшота `goldenReport`). Только
// математика: отбор выборки, повторный прогон и запись в ais — в приложении.
export {
    AGREEMENT_DEFAULTS,
    KAPPA_WEIGHTINGS,
    buildGoldenReport,
    categoryPairsOf,
    cohenKappa,
    confusionTable,
    differenceStats,
    disagreementWeight,
    f1FromCounts,
    iccOfPairs,
    iccTwoWay,
    isBalancedMatrix,
    kappaLevels,
    pabakOf,
    pairDifferences,
    scalePairsOf,
    setCounts,
    setF1,
    setF1ByCode,
    sigmaOfPairs,
    sumCounts,
    tost,
    tostOfPairs,
} from './model/agreement';
export type {
    AgreementPair,
    AgreementReportInput,
    AgreementRun,
    CategoryPair,
    CohenKappaOptions,
    CohenKappaResult,
    ConfusionTable,
    DifferenceStats,
    F1CodeResult,
    F1Counts,
    F1Result,
    IccAnovaResult,
    KappaWeighting,
    ScalePair,
    SetPair,
    TostOptions,
    TostResult,
} from './model/agreement';
export { isGoldenReportLike } from './contracts/golden-report.types';
export type {
    GoldenCategoryAgreement,
    GoldenObjectionsAgreement,
    GoldenReport,
    GoldenScaleAgreement,
    GoldenSigmaLlm,
} from './contracts/golden-report.types';

// Фаза 3, поток П1 «тренды рядов менеджера»: нормализация ряда по
// разрывам (comparableFrom, версии разбора), EWMA и дрейф, CUSUM и сдвиг
// уровня, циркулярная блочная калибровка порогов step-down max-T по
// семейству и сборка сигналов ряда с доверием. Только математика: ряды
// из снапшотов, семейство портала и запись `ai-analytics-trends` — в
// приложении (шаг `trends`).
export {
    MOVING_RANGE_D2,
    TREND_CONFIDENCE_REASONS,
    TREND_DEFAULTS,
    TREND_DIRECTIONS,
    TREND_SIGNAL_KINDS,
    calibrateFamilyThresholds,
    circularBlockBootstrap,
    circularBlockShuffle,
    cusumExcursion,
    cusumStatistic,
    cusumTrajectory,
    defaultBlockLength,
    detectDrift,
    detectOutlier,
    detectShift,
    detectTrendSignals,
    driftStatistic,
    driftStatistics,
    ewma,
    meanOf,
    normalizeTrendSeries,
    personalSigma,
    runningMin,
    versionBreakIndex,
} from './model/trend/index';
// Фаза 3, поток П3 «сравнение год назад»: выбор пары периодов M и M−12 и
// флаг сопоставимости с причинами (решение владельца В9 от 22.09.2026 —
// другой отдел или уровень год назад не подменяют менеджера, а делают
// пару несопоставимой). Чтение снапшотов и витрина — в приложении.
export {
    SAME_PERIOD_LAG_MONTHS,
    SAME_PERIOD_REASONS,
    isMonthKey,
    monthFirstDay,
    monthLastDay,
    samePeriodKey,
    selectSamePeriod,
    shiftMonthKey,
} from './model/trend/index';
export type {
    SamePeriodComposition,
    SamePeriodInput,
    SamePeriodPair,
    SamePeriodReason,
} from './model/trend/index';
export type {
    CusumOptions,
    CusumTrajectory,
    DriftDetection,
    DriftOptions,
    FamilyCalibration,
    FamilyCalibrationOptions,
    NormalizeTrendOptions,
    SeriesStatistic,
    ShiftDetection,
    TrendConfidenceReason,
    TrendDetectOptions,
    TrendDetection,
    TrendDirection,
    TrendPoint,
    TrendSeries,
    TrendSeriesCut,
    TrendSeriesPoint,
    TrendSignal,
    TrendSignalKind,
    TrendThresholds,
} from './model/trend/index';

// Фаза 3, поток П2 «реконсиляция план-факт»: сверка целей руководителя со
// фактом на дату — темп по рабочим дням, описательный прогноз закрытия под
// потолком дня, разрыв и «сколько надо в день». Источник плана — только
// снимок целей `plan` (решение владельца В6 от 22.09.2026).
export {
    PLAN_FACT_INDICATORS,
    PLAN_FACT_REASONS,
    PLAN_FACT_STATUSES,
    expectedShare,
    forecastAtPace,
    paceStatus,
    perDayNeeded,
    reconcile,
    reconcileIndicator,
    reconcileTeam,
    workdaysLeft,
} from './model/plan-fact';
export type {
    PlanFactExposure,
    PlanFactIndicator,
    PlanFactInput,
    PlanFactReason,
    PlanFactRow,
    PlanFactStatus,
    PlanFactTargets,
    PlanFactValues,
} from './model/plan-fact';
