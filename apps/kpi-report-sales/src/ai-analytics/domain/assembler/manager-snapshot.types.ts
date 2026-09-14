/**
 * Нагрузки менеджерских снапшотов Фазы 2 (план §3.1, поток 14b): неделя,
 * месяц и стиль в том виде, в каком они ложатся в `user_result` записи
 * `ais`.
 *
 * Базовые формы (`ManagerWeekSnapshot`, `ManagerMonthSnapshot`) объявлены
 * в библиотеке и принадлежат потоку хранилища снапшотов — здесь они
 * только расширяются полями Фазы 2 (экспозиция, трактовка рёбер, паспорт,
 * снимок планов, идентификатор модели, потолки оценивания). Расширение на
 * стороне приложения выбрано осознанно: конкурировать за общий файл
 * контрактов библиотеки потоки волны 4 не должны (§1.6 п. 8).
 *
 * Все поля JSON-сериализуемы: `Date` внутри нагрузок запрещены (§3.2).
 */
import type {
    AiEdgeEstimand,
    AiSnapshotMeta,
    AnalysisVersions,
    ExposureDaysSource,
    ManagerEdgeCounts,
    ManagerFinanceFacts,
    ManagerMonthSnapshot,
    ManagerWeekSnapshot,
    StyleProfile,
} from '@lib/sales-ai-analytics';

/**
 * Версии расчёта в нагрузке (план §3.1, §10.3 m1) с `modelSnapshotId`
 * объявлены в контрактах библиотеки (`contracts/snapshot.types.ts`,
 * владелец — поток стора); здесь реэкспорт, чтобы прежние импорты
 * ассемблеров и use-case'ов не менялись.
 */
export type { AiSnapshotMeta };

/**
 * Паспорт менеджера в том объёме, в каком его читают ассемблеры. Берётся
 * ИЗ ШИНЫ (ключ `passport`), а не импортом файла соседнего потока:
 * владелец паспорта — поток 14a, и связь между потоками идёт значением,
 * а не зависимостью модулей.
 *
 * Тип намеренно шире контракта `ManagerPassport` библиотеки (перечисления
 * ослаблены до строк): читатель шины не должен ронять месяц из-за
 * незнакомого значения статуса или полосы. `ManagerPassport` этому типу
 * присваивается.
 */
export interface ManagerPassportFacts {
    managerId: string;
    /** Начало стажа 'YYYY-MM-DD'; null — не удалось определить. */
    since: string | null;
    /** Откуда взята дата стажа: приём, регистрация, первое событие. */
    sinceSource: string | null;
    status: string | null;
    /** Дата ухода 'YYYY-MM-DD'; null — работает. */
    leftAt: string | null;
    level: string | null;
    levelSource: string | null;
    tenureMonths: number | null;
    tenureBand: string | null;
}

/** Ребро воронки месяца с трактовкой и признаком смешанных источников. */
export interface ManagerEdgeFacts extends ManagerEdgeCounts {
    /** Интенсивность (до сцепки со сделками) или вероятность эпизода. */
    estimand: AiEdgeEstimand;
    /** s > n при вероятностной трактовке — числитель из другого источника. */
    mixedSources: boolean;
}

/** Экспозиция менеджер-месяца (план §4.2) в нагрузке снапшота. */
export interface ManagerExposureFacts {
    /** D_calendar — рабочих дней календаря портала в месяце. */
    dCalendar: number;
    /** D_mt = fte × (рабочие дни минус отсутствия). */
    dMt: number;
    /** D_active — дней месяца хотя бы с одним звонком. */
    dActive: number;
    /** Простойные дни: нулевые серии короче порога прокси-отсутствия. */
    idleDays: number;
    daysSource: ExposureDaysSource;
    /** Менеджер-месяц не участвует в оценке норм (прокси или мало дней). */
    excludedFromNorms: boolean;
    /** Причина исключения; null — месяц участвует в нормах. */
    excludeReason: string | null;
    fte: number;
}

/** Живой пайплайн менеджера на момент расчёта (открытые сделки). */
export interface ManagerPipelineFacts {
    /** Открытых сделок от порога пайплайна («от презентации и выше»). */
    count: number;
    /** Их месячный чек, ₽. */
    monthlyAmount: number;
    /** «Горячие»: стадия не ниже «В решении» (order ≥ 8, решение А.2). */
    hot: number;
    /** Из «горячих» — с товарными строками («с предложением»). */
    withOffer: number;
}

/**
 * Финансовый хвост месяца: закрытые продажи, документные счета и живой
 * пайплайн. Сумму счетов источники Фазы 2 не отдают — `invoicesSumKnown`
 * говорит об этом прямо, вместо того чтобы выдавать ноль за факт.
 */
export interface ManagerFinanceMonthFacts extends ManagerFinanceFacts {
    /** Аванс закрытых сделок: Σ price × qty товарных строк, ₽. */
    advanceSum: number;
    /** Ожидаемая сумма договоров закрытых сделок, ₽. */
    expectedContractSum: number;
    /** Оплаченные месяцы закрытых сделок. */
    paidMonths: number;
    /** false — `invoicesSum` не из источника, а заглушка (счёт по числу). */
    invoicesSumKnown: boolean;
    /** Пайплайн; null — месяц закрыт, живой пайплайн к нему не относится. */
    pipeline: ManagerPipelineFacts | null;
}

/** Снимок плана руководителя на месяц (UF_USR_A_SALES_PLAN_*). */
export interface ManagerPlanSnapshot {
    sales: number | null;
    calls: number | null;
    presentations: number | null;
}

/** Подпись профиля стиля в нагрузке (полный профиль — в снапшоте стиля). */
export interface ManagerStyleTag {
    code: string;
    title: string;
    /** Опора подписи в числах — то, что показывается в карточке. */
    basis: string;
    n: number;
}

/** Профиль стиля в нагрузке месяца и снапшоте `ai-analytics-style`. */
export interface ManagerStyleFacts {
    /** Сравнимых разборов в окне. */
    calls: number;
    /** Коллег в норме (leave-one-out). */
    peers: number;
    /** Ось → усаженное отклонение; пусто при `confidence: none`. */
    vector: Record<string, number>;
    tags: ManagerStyleTag[];
    /** ok | low | none — при `none` подписей нет по построению. */
    confidence: string;
    /** Почему доверие снижено ('few-calls', 'few-peers'); null — доверие ok. */
    confidenceReason: string | null;
    /** Окно профиля: месяцы 'YYYY-MM' по возрастанию. */
    window: string[];
}

/** Сработавший потолок оценивания в неделе: правило и сколько разборов задел. */
export interface ManagerScoringFlag {
    ruleCode: string;
    section: string;
    flag: string;
    maxScore: number;
    /** Разборов, где правило сработало. */
    calls: number;
    /** Из них разборов, где балл раздела действительно срезан. */
    cut: number;
}

/** Раздел, вычеркнутый как неприменимый к типу звонка, и объём вычерка. */
export interface ApplicabilityCut {
    callType: string;
    section: string;
    /** Разборов, где раздел не пошёл в знаменатель. */
    calls: number;
}

/**
 * След применимости разделов за период (план §4.3): по какому порогу
 * приора построена таблица и что она вычеркнула. Таблица выводится из
 * профилей типов и не настраивается, поэтому в снапшот едет только след.
 */
export interface ManagerApplicabilityTrace {
    /** Порог приора релевантности, с которого раздел применим. */
    minRelevance: number;
    /** Вычеркнутые разделы по возрастанию типа и кода раздела. */
    excluded: ApplicabilityCut[];
}

/**
 * Неделя менеджера (`ai-analytics-manager-week`): базовая форма плюс
 * счёт звонков до границы сравнимой истории, следы потолков оценивания
 * и стоп-фраз, версии расчёта.
 */
export interface ManagerWeekPayload extends ManagerWeekSnapshot {
    /** Разобранных звонков ДО `comparableFrom` — считаются отдельно. */
    nBeforeComparable: number;
    /** Сработавшие правила потолков (`ai_analytics_scoring.caps`). */
    caps: ManagerScoringFlag[];
    /** Флаги разбора, выставленные потолками, без повторов. */
    flags: string[];
    /** Найденные стоп-фразы недели (балл не меняют — материал разговора). */
    stopWords: string[];
    /** Что вычеркнула применимость разделов (материал «Как считаем»). */
    applicability: ManagerApplicabilityTrace;
    meta: AiSnapshotMeta;
}

/**
 * Месяц менеджера (`ai-analytics-manager-month`): базовая форма плюс
 * экспозиция, трактовка рёбер, паспорт, снимок плана, профиль стиля и
 * версии расчёта с идентификатором модели портала.
 */
export interface ManagerMonthPayload extends ManagerMonthSnapshot {
    edges: ManagerEdgeFacts[];
    finance: ManagerFinanceMonthFacts;
    exposure: ManagerExposureFacts;
    /** Сработавшие правила потолков месяца (`ai_analytics_scoring.caps`). */
    caps: ManagerScoringFlag[];
    /** Флаги разбора, выставленные потолками, без повторов. */
    flags: string[];
    /** Найденные стоп-фразы месяца (балл не меняют — материал разговора). */
    stopWords: string[];
    /** Что вычеркнула применимость разделов (материал «Как считаем»). */
    applicability: ManagerApplicabilityTrace;
    /** Паспорт из шины; null — шаг паспорта не отработал. */
    passport: ManagerPassportFacts | null;
    /** Снимок плана руководителя; null — планов на месяц нет. */
    planSnapshot: ManagerPlanSnapshot | null;
    /** Профиль стиля месяца; null — окно стиля не считалось. */
    style: ManagerStyleFacts | null;
    meta: AiSnapshotMeta;
}

/** Нагрузка снапшота `ai-analytics-style`: профиль и версии расчёта. */
export interface ManagerStylePayload extends ManagerStyleFacts {
    /** Полный расчёт осей — материал витрины «Как считаем». */
    axes: StyleProfile['axes'];
    /** Ожидаемое число ложных подписей Σ(1 − p_ROPE). */
    expectedFalseTags: number;
    funnelShape: string;
    meta: AiSnapshotMeta;
}

/** Готовая к записи нагрузка одного менеджера. */
export interface ManagerSnapshotRow<T> {
    managerId: string;
    payload: T;
}

/** Сигнатура версий разбора в строку — для сравнения и группировки. */
export function versionsKey(versions: AnalysisVersions | null): string {
    return versions === null
        ? ''
        : [
              versions.prompt,
              versions.rubric,
              versions.registry,
              versions.attribution,
              versions.classifier,
          ].join('|');
}
