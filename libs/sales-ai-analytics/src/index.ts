export * from './sales-ai-analytics.module';

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
export type {
    AiAnalyticsAuditPortalStatus,
    AiAnalyticsAuditResult,
    AiAnalyticsAuditRunOptions,
} from './admin/ai-analytics-audit.service';
export type {
    AiAnalyticsAuditSnapshotInput,
    AiAnalyticsAuditSnapshotRecord,
} from './admin/ai-analytics-audit-snapshot.store';

// Фаза 2 «модель»: реестр параметров и послойный resolve (params/),
// типы и реестр снапшотов ais, нормы (экспозиция, κ, leave-one-out,
// апостериоры рёбер) и качество за период (усадка разделов, надёжность).
// Пока к ручкам не подключено — чистая математика и контракты.
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

// Фаза 2, волна 1 (добор) «потолки, применимость и стиль»: потолки оценок
// и стоп-фразы правил `ai_analytics_scoring` (балл режется, стоп-слово только
// возвращается списком), таблица применимости «тип звонка × раздел рубрики»
// из профилей рубрики и профиль стиля менеджера (оси, leave-one-out норма
// коллег, усадка к τ, подписи с гистерезисом — вместо ярлыков).
export * from './model/scoring-caps';
export * from './model/applicability';
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
