/**
 * Уровни доказательности и допустимые формулировки (план §4.10).
 *
 * - **E0** — факт с n и интервалом («так есть»);
 * - **E1** — ассоциация с дизайном (случайный эффект менеджера, оффсет
 *   портал×месяц, страта базы), гейт β пройден, интервал не накрывает
 *   практический ноль, знак сохраняется внутри страт, плацебо пройдены,
 *   версии сравнимы;
 * - **E2** — пул ≥ 5 порталов с отчитанным I², портал внутри
 *   предиктивного интервала, наклон калибровки накрывает 1 — либо
 *   квази-эксперимент;
 * - **E3** — пререгистрированный эксперимент.
 *
 * Совет «делай X вместо Y» разрешён с E2; при E1 формулировка —
 * «ниже нормы по X; в данных это связано с Y», без императива.
 * Слово «значимо» в формулировках запрещено (приёмка §6).
 */
export const AI_EVIDENCE_LEVELS = ['E0', 'E1', 'E2', 'E3'] as const;

/** Уровень доказательности рекомендации. */
export type AiEvidenceLevel = (typeof AI_EVIDENCE_LEVELS)[number];

export const EVIDENCE_DEFAULTS = {
    /** `n_min_none` — ниже ни одного числа наружу. */
    minN: 8,
    /** Минимум порталов пула для E2. */
    minPoolPortals: 5,
    /** `evidence_gate` — с какого уровня разрешён совет «что менять». */
    adviceGate: 'E2',
} as const satisfies {
    minN: number;
    minPoolPortals: number;
    adviceGate: AiEvidenceLevel;
};

/** Дизайн наблюдательной оценки (условие уровня E1). */
export interface EvidenceDesign {
    /** Случайный эффект менеджера (partial pooling). */
    readonly managerRandomEffect: boolean;
    /** Оффсет портал×месяц из норм. */
    readonly portalMonthOffset: boolean;
    /** Страта базы (`lead_kind`). */
    readonly leadKindStratum: boolean;
}

/** Условия пула (уровень E2). */
export interface EvidencePool {
    readonly portals: number;
    readonly iSquaredReported: boolean;
    readonly withinPredictiveInterval: boolean;
    readonly calibrationSlopeCoversOne: boolean;
}

/** Вход определения уровня доказательности. */
export interface EvidenceInput {
    /** Знаменатель факта. */
    readonly n: number;
    readonly minN?: number;
    /** У числа есть интервал (иначе даже E0 — без числа). */
    readonly hasInterval: boolean;
    readonly design?: EvidenceDesign;
    readonly betaGatePassed?: boolean;
    /** Интервал эффекта не накрывает практический ноль. */
    readonly intervalExcludesPracticalZero?: boolean;
    /** Знак эффекта сохраняется внутри страт. */
    readonly signStableAcrossStrata?: boolean;
    /** Плацебо-проверки пройдены (лид-эффект, аудит меток времени). */
    readonly placeboPassed?: boolean;
    /** Версии промпта и классификатора сравнимы на окне. */
    readonly versionsComparable?: boolean;
    readonly pool?: EvidencePool;
    readonly quasiExperiment?: boolean;
    readonly preregisteredExperiment?: boolean;
}

/** Порядковый номер уровня — для сравнения с гейтом. */
export const evidenceRank = (level: AiEvidenceLevel): number =>
    AI_EVIDENCE_LEVELS.indexOf(level);

function meetsE1(input: EvidenceInput): boolean {
    const design = input.design;

    return (
        input.hasInterval &&
        input.n >= (input.minN ?? EVIDENCE_DEFAULTS.minN) &&
        design !== undefined &&
        design.managerRandomEffect &&
        design.portalMonthOffset &&
        design.leadKindStratum &&
        input.betaGatePassed === true &&
        input.intervalExcludesPracticalZero === true &&
        input.signStableAcrossStrata === true &&
        input.placeboPassed === true &&
        input.versionsComparable === true
    );
}

function meetsE2(input: EvidenceInput): boolean {
    if (input.quasiExperiment === true) {
        return true;
    }
    const pool = input.pool;

    return (
        pool !== undefined &&
        pool.portals >= EVIDENCE_DEFAULTS.minPoolPortals &&
        pool.iSquaredReported &&
        pool.withinPredictiveInterval &&
        pool.calibrationSlopeCoversOne
    );
}

/**
 * Уровень доказательности: лестница монотонна — E2 и E3 требуют
 * выполненных условий E1, иначе оценка остаётся ассоциацией.
 */
export function evidenceLevelFor(input: EvidenceInput): AiEvidenceLevel {
    if (!meetsE1(input)) {
        return 'E0';
    }
    if (input.preregisteredExperiment === true) {
        return 'E3';
    }

    return meetsE2(input) ? 'E2' : 'E1';
}

/** Совет «что менять» разрешён, если уровень не ниже гейта. */
export function adviceAllowed(
    level: AiEvidenceLevel,
    gate: AiEvidenceLevel = EVIDENCE_DEFAULTS.adviceGate,
): boolean {
    return evidenceRank(level) >= evidenceRank(gate);
}

/** Императивы совета — запрещены ниже гейта (E0/E1). */
export const AI_ADVICE_IMPERATIVES = [
    'делай',
    'вместо',
    'сделай',
    'начни',
    'перестань',
    'замени',
] as const;

/** В тексте есть императив совета «делай X вместо Y». */
export function hasImperative(text: string): boolean {
    const lower = text.toLowerCase();

    return AI_ADVICE_IMPERATIVES.some(word => lower.includes(word));
}

/** Данные формулировки: факт, связь и предлагаемое действие. */
export interface PhraseInput {
    /** Что измеряем по-русски (раздел, ребро, тип звонка). */
    readonly metric: string;
    /** Отформатированное значение факта. */
    readonly value?: string;
    /** Знаменатель факта. */
    readonly n?: number;
    /** С чем это связано в данных (E1). */
    readonly linkedTo?: string;
    /** Что делать (E2 и выше). */
    readonly action?: string;
    /** Вместо чего (E2 и выше). */
    readonly instead?: string;
}

function factPhrase(input: PhraseInput): string {
    const value = input.value ? `: ${input.value}` : '';
    const n = typeof input.n === 'number' ? ` при n = ${input.n}` : '';

    return `${input.metric}${value}${n}`;
}

/**
 * Формулировка по уровню: E0 — только факт; E1 — ассоциация без
 * императива; E2/E3 — совет «делай X вместо Y». Слово «значимо»
 * не используется ни на одном уровне.
 */
export function phraseFor(level: AiEvidenceLevel, input: PhraseInput): string {
    if (level === 'E0') {
        return factPhrase(input);
    }
    if (level === 'E1') {
        const linked = input.linkedTo
            ? `; в данных это связано с ${input.linkedTo}`
            : '';

        return `${factPhrase(input)}${linked}`;
    }
    const action = input.action ?? input.metric;
    const instead = input.instead ? ` вместо ${input.instead}` : '';
    const prefix = level === 'E3' ? 'по результатам эксперимента: ' : '';

    return `${prefix}делай ${action}${instead} (${factPhrase(input)})`;
}
