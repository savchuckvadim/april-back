/**
 * Ответы админ-ручек Фазы 4 (волна B, поток B3): только числа, статусы и
 * коды — без доменов других порталов (участники пула — обезличенными
 * ключами) и без текстов для клиента. DTO ответа реализуют эти интерфейсы.
 */
import type { ForecastBacktestStatus } from '../../model/forecast-backtest.types';
import type { AiLever } from '../../model/lever.types';
import type { PoolStatus } from '../../model/pool.types';
import type { RecommendationGateStatus } from '../../model/recommendation-effect.types';
import type { AiQualityLinkStatus } from '../../contracts/snapshot.phase4.types';

/** Метаданные прочитанного снапшота. */
export interface Phase4SnapshotRef {
    /** Ключ месяца снапшота 'YYYY-MM'. */
    monthKey: string;
    /** Момент формирования, ISO (UTC). */
    generatedAt: string;
}

/** Оценка с интервалом 90 %. */
export interface Phase4Estimate {
    value: number;
    ci90: number[];
}

/** Доля с интервалом; value и ci90 — null ниже порога числа наблюдений. */
export interface Phase4Share {
    value: number | null;
    ci90: number[] | null;
    n: number;
}

// --- Пул порталов -----------------------------------------------------------

/** Вердикт по порталу пула — только обезличенный ключ. */
export interface Phase4PoolPortal {
    key: string;
    included: boolean;
    reason: string;
}

/** β пула с неоднородностью. */
export interface Phase4PoolBeta extends Phase4Estimate {
    iSquared: number;
    portals: number;
    label: string;
}

export interface Phase4PoolSnapshotView extends Phase4SnapshotRef {
    status: PoolStatus;
    reasons: string[];
    /** Порталов с согласием и историей. */
    eligible: number;
    /** Порталов, вошедших в пул. */
    participants: number;
    portals: Phase4PoolPortal[];
    /** Обезличенный ключ этого портала. */
    selfKey: string;
    /** Этот портал вошёл в пул; null — себя в вердиктах нет. */
    selfIncluded: boolean | null;
    /** Рёбер воронки с нормой пула. */
    edges: number;
    beta: Phase4PoolBeta | null;
    betaPortals: number;
    minPortalsE2: number;
    evidenceReady: boolean;
}

export interface Phase4PoolStatus {
    domain: string;
    latest: Phase4PoolSnapshotView | null;
}

// --- Связь качества с исходом -------------------------------------------------

export interface Phase4QualityLinkView extends Phase4SnapshotRef {
    status: AiQualityLinkStatus;
    reasons: string[];
    sampleN: number;
    sampleEvents: number;
    sampleManagers: number;
    windowDays: number;
    within: Phase4Estimate | null;
    between: Phase4Estimate | null;
    pooled: Phase4Estimate | null;
    epv: number | null;
    reliabilityR: number | null;
    calibrationSlope: Phase4Estimate | null;
    calibrationCoversOne: boolean | null;
    placeboPassed: boolean | null;
    gatePassedNow: boolean;
    gateStreak: number;
    gateMonths: number;
    published: boolean;
    timestampLeakOk: boolean;
}

export interface Phase4QualityLink {
    domain: string;
    latest: Phase4QualityLinkView | null;
}

// --- Проверка точности прогноза ----------------------------------------------

export interface Phase4BacktestView extends Phase4SnapshotRef {
    status: ForecastBacktestStatus;
    reasons: string[];
    shadowMonths: number;
    shadowMinMonths: number;
    /** Месяцев и дней в проверке; 0 — журналов с фактом нет. */
    months: number;
    days: number;
    coverageShare: number | null;
    coverageCi90: number[] | null;
    coverageTarget: number | null;
    maseNaive: number | null;
    maseNaiveCi90: number[] | null;
    maseMean3: number | null;
    maseMean3Ci90: number[] | null;
    maseMax: number | null;
    pinballMean: number | null;
}

export interface Phase4ForecastBacktest {
    domain: string;
    /** Сколько месяцев запрошено. */
    months: number;
    /** Проверки по закрытым месяцам, свежие первыми. */
    items: Phase4BacktestView[];
}

// --- Эффект советов ---------------------------------------------------------

export interface Phase4LeverEffect {
    lever: AiLever;
    issued: number;
    completedWindows: number;
    done: number;
    disagree: number;
    doneShare: Phase4Share;
}

export interface Phase4EdgeBeforeAfter {
    edge: string;
    beforeS: number;
    beforeN: number;
    afterS: number;
    afterN: number;
    diff: number | null;
    ci90: number[] | null;
    /** Окон «менеджер × месяц выдачи» (не советов). */
    windows: number;
}

export interface Phase4EffectView extends Phase4SnapshotRef {
    issuedMonths: string[];
    issued: number;
    completedWindows: number;
    done: number;
    disagree: number;
    doneShare: Phase4Share;
    disagreeShare: Phase4Share;
    gateStatus: RecommendationGateStatus;
    gateReasons: string[];
    byLever: Phase4LeverEffect[];
    beforeAfter: Phase4EdgeBeforeAfter[];
    goodhartFlags: number;
    goodhartManagers: number;
}

export interface Phase4RecommendationEffect {
    domain: string;
    latest: Phase4EffectView | null;
}
