import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { BETA_POWER_DEFAULTS } from '../model/beta-power';
import { CAPACITY_DEFAULTS } from '../model/capacity';
import { DAILY_PLAN_DEFAULTS } from '../model/daily-plan';
import { EDGE_ESTIMAND_DEFAULTS } from '../model/edge-estimand';
import {
    EDGE_GAP_PRACTICAL,
    EDGE_RATE_DEFAULTS,
    PERCENT_POINTS_IN_UNIT,
    practicalDeltaFromPct,
} from '../model/edge-rate';
import { EVIDENCE_DEFAULTS } from '../model/evidence';
import { EXPOSURE_DEFAULTS } from '../model/exposure';
import { FUNNEL_GAP_DEFAULTS } from '../model/funnel-gap';
import { KAPPA_DEFAULTS } from '../model/kappa';
import { LAG_CDF_DEFAULTS, LAG_CDF_PARAM_CODE } from '../model/lag-cdf';
import { NORM_HIERARCHY_DEFAULTS } from '../model/norms-hierarchy';
import { QAV_DEFAULTS } from '../model/qav';
import { RAMP_DEFAULTS } from '../model/ramp';
import { AI_READINESS_GATE_DEFAULTS } from '../model/readiness';
import { LEVER_DEFAULTS } from '../model/recommend';
import { RELIABILITY_DEFAULTS } from '../model/reliability';
import { SECTION_SHRINK_DEFAULTS } from '../model/section-shrink';
import { SHRINK_DEFAULTS } from '../model/shrink';
import { STAGE_THETA_DEFAULTS } from '../model/stage-theta.types';
import { AI_ANALYTICS_THRESHOLDS } from '../model/thresholds.const';
import { TIMESTAMP_LEAK_MAX } from '../model/timestamp-audit';
import { registryEnumDefault } from '../params/registry.access';
import {
    AI_ANALYTICS_PARAM_DEFAULTS,
    findParam,
} from '../params/registry.const';
import type { ParamPrimitive } from '../params/registry.types';

/**
 * Приёмка находки M8 аудита Фазы 2: ни один `*_DEFAULTS` библиотеки не
 * дублирует величину реестра литералом. Спека держит таблицу соответствия
 * «объект.поле → код реестра» — по коду grep находит и дескриптор, и место
 * применения, — и запрещает полю тихо появиться мимо таблицы: каждое поле
 * либо взято из реестра, либо выведено из него формулой, либо объявлено
 * локальной константой с пометкой «не параметр реестра» в исходнике.
 */

/** Значения дефолтов модели — только примитивы (правило реестра). */
type DefaultsObject = Readonly<Record<string, ParamPrimitive>>;

/** Объекты дефолтов библиотеки и файл, в котором они объявлены. */
const OBJECTS: Readonly<
    Record<string, { readonly values: DefaultsObject; readonly file: string }>
> = {
    EXPOSURE_DEFAULTS: { values: EXPOSURE_DEFAULTS, file: 'exposure.ts' },
    KAPPA_DEFAULTS: { values: KAPPA_DEFAULTS, file: 'kappa.ts' },
    SHRINK_DEFAULTS: { values: SHRINK_DEFAULTS, file: 'shrink.ts' },
    SECTION_SHRINK_DEFAULTS: {
        values: SECTION_SHRINK_DEFAULTS,
        file: 'section-shrink.ts',
    },
    RELIABILITY_DEFAULTS: {
        values: RELIABILITY_DEFAULTS,
        file: 'reliability.ts',
    },
    QAV_DEFAULTS: { values: QAV_DEFAULTS, file: 'qav.ts' },
    LAG_CDF_DEFAULTS: { values: LAG_CDF_DEFAULTS, file: 'lag-cdf.ts' },
    DAILY_PLAN_DEFAULTS: {
        values: DAILY_PLAN_DEFAULTS,
        file: 'daily-plan.ts',
    },
    RAMP_DEFAULTS: { values: RAMP_DEFAULTS, file: 'ramp.ts' },
    EDGE_ESTIMAND_DEFAULTS: {
        values: EDGE_ESTIMAND_DEFAULTS,
        file: 'edge-estimand.ts',
    },
    LEVER_DEFAULTS: { values: LEVER_DEFAULTS, file: 'recommend.ts' },
    EVIDENCE_DEFAULTS: { values: EVIDENCE_DEFAULTS, file: 'evidence.ts' },
    BETA_POWER_DEFAULTS: {
        values: BETA_POWER_DEFAULTS,
        file: 'beta-power.ts',
    },
    EDGE_RATE_DEFAULTS: { values: EDGE_RATE_DEFAULTS, file: 'edge-rate.ts' },
    EDGE_GAP_PRACTICAL: { values: EDGE_GAP_PRACTICAL, file: 'edge-rate.ts' },
    STAGE_THETA_DEFAULTS: {
        values: STAGE_THETA_DEFAULTS,
        file: 'stage-theta.types.ts',
    },
    AI_READINESS_GATE_DEFAULTS: {
        // `ReadinessGates` — интерфейс без индексной сигнатуры, поэтому
        // в таблицу кладётся его копия (анонимный тип литерала).
        values: { ...AI_READINESS_GATE_DEFAULTS },
        file: 'readiness.ts',
    },
    CAPACITY_DEFAULTS: { values: CAPACITY_DEFAULTS, file: 'capacity.ts' },
    FUNNEL_GAP_DEFAULTS: {
        values: FUNNEL_GAP_DEFAULTS,
        file: 'funnel-gap.ts',
    },
    AI_ANALYTICS_THRESHOLDS: {
        values: AI_ANALYTICS_THRESHOLDS,
        file: 'thresholds.const.ts',
    },
    NORM_HIERARCHY_DEFAULTS: {
        values: NORM_HIERARCHY_DEFAULTS,
        file: 'norms-hierarchy.ts',
    },
};

/**
 * Поля, равные `defaultValue` кода реестра. Список держится здесь как
 * `as const`, чтобы соответствие «поле → код» искалось grep'ом.
 */
const REGISTRY_FIELDS = [
    ['EXPOSURE_DEFAULTS.absenceProxyMinRun', 'absence_proxy_min_run'],
    ['EXPOSURE_DEFAULTS.minWorkdaysMonth', 'min_workdays_month'],
    ['EXPOSURE_DEFAULTS.fte', 'fte_share_default'],
    ['KAPPA_DEFAULTS.activityDays', 'kappa_activity_days'],
    ['KAPPA_DEFAULTS.edgeEarly', 'kappa_edge_early'],
    ['KAPPA_DEFAULTS.edgeLate', 'kappa_edge_late'],
    ['KAPPA_DEFAULTS.max', 'kappa_max'],
    ['KAPPA_DEFAULTS.layerRatio', 'kappa_layer_ratio'],
    ['KAPPA_DEFAULTS.portalToGlobal', 'kappa_portal_to_global'],
    ['SHRINK_DEFAULTS.forgetLambda', 'forget_lambda'],
    ['SECTION_SHRINK_DEFAULTS.mDefault', 'm_s_default'],
    ['SECTION_SHRINK_DEFAULTS.mMax', 'm_s_max'],
    ['RELIABILITY_DEFAULTS.sigmaLlm', 'sigma_llm_default'],
    ['RELIABILITY_DEFAULTS.iccMin', 'dq_score_icc_min'],
    ['RELIABILITY_DEFAULTS.retestBudgetCalls', 'retest_budget_calls'],
    ['RELIABILITY_DEFAULTS.deltaPracticalScore', 'delta_prac_score'],
    ['QAV_DEFAULTS.sRef', 's_ref'],
    ['QAV_DEFAULTS.sReqMax', 's_req_max'],
    ['LAG_CDF_DEFAULTS.medianDays', 'cycle_median_days'],
    ['LAG_CDF_DEFAULTS.windowDays', 'lag_window_sale_days'],
    ['LAG_CDF_DEFAULTS.fMin', 'f_min'],
    ['DAILY_PLAN_DEFAULTS.ceilingMultiplier', 'plan_day_ceiling'],
    ['DAILY_PLAN_DEFAULTS.fMin', 'f_min'],
    ['DAILY_PLAN_DEFAULTS.dayHours', 'day_hours'],
    ['RAMP_DEFAULTS.tau0Months', 'ramp_tau0_months'],
    ['RAMP_DEFAULTS.volumeBoost', 'ramp_volume_boost'],
    ['EDGE_ESTIMAND_DEFAULTS.enterPct', 'deal_chain_min_pct'],
    ['EDGE_ESTIMAND_DEFAULTS.exitPct', 'deal_chain_exit_pct'],
    ['LEVER_DEFAULTS.max', 'lever_max'],
    ['LEVER_DEFAULTS.lbLevel', 'lever_lb_level'],
    ['LEVER_DEFAULTS.minSectionCalls', 'lever_min_section_calls'],
    ['LEVER_DEFAULTS.minN', 'n_min_none'],
    ['EVIDENCE_DEFAULTS.minN', 'n_min_none'],
    ['EVIDENCE_DEFAULTS.minPoolPortals', 'pool_min_portals_beta'],
    ['EVIDENCE_DEFAULTS.adviceGate', 'evidence_gate_advice'],
    ['BETA_POWER_DEFAULTS.reliability', 'icc_form'],
    ['BETA_POWER_DEFAULTS.seTarget', 'beta_gate_se'],
    ['EDGE_RATE_DEFAULTS.phi', 'overdispersion_default'],
    ['EDGE_RATE_DEFAULTS.lambda', 'forget_lambda'],
    ['EDGE_RATE_DEFAULTS.kappaActivity', 'kappa_activity_days'],
    ['EDGE_GAP_PRACTICAL.score', 'delta_prac_score'],
    ['STAGE_THETA_DEFAULTS.kappa', 'kappa_edge_late'],
    ['AI_READINESS_GATE_DEFAULTS.calibrationMonths', 'calibration_min_months'],
    [
        'AI_READINESS_GATE_DEFAULTS.normsPresentations',
        'calibration_min_presentations',
    ],
    [
        'AI_READINESS_GATE_DEFAULTS.rosterConfirmRequired',
        'roster_confirm_required',
    ],
    ['CAPACITY_DEFAULTS.quantile', 'cap_quantile'],
    ['CAPACITY_DEFAULTS.dayHours', 'day_hours'],
    ['FUNNEL_GAP_DEFAULTS.samples', 'lever_samples'],
    ['FUNNEL_GAP_DEFAULTS.minN', 'n_min_none'],
    ['AI_ANALYTICS_THRESHOLDS.scoreNone', 'n_min_none'],
    ['AI_ANALYTICS_THRESHOLDS.scoreLow', 'n_min_ok_score'],
    ['AI_ANALYTICS_THRESHOLDS.rateOk', 'n_min_ok_rate'],
    ['AI_ANALYTICS_THRESHOLDS.ratingMin', 'n_min_rating'],
    ['AI_ANALYTICS_THRESHOLDS.trendWindowCalls', 'trend_window_calls'],
    ['AI_ANALYTICS_THRESHOLDS.xmrSigma', 'xmr_sigma'],
    ['AI_ANALYTICS_THRESHOLDS.runLength', 'xmr_run_length'],
    ['AI_ANALYTICS_THRESHOLDS.z90', 'z_compare'],
    ['AI_ANALYTICS_THRESHOLDS.shortCallSec', 'min_duration_sec_by_type'],
    ['NORM_HIERARCHY_DEFAULTS.portalToGlobal', 'kappa_portal_to_global'],
    ['NORM_HIERARCHY_DEFAULTS.bootRatio', 'kappa_boot_ratio'],
] as const satisfies readonly (readonly [string, string])[];

/**
 * Поля, выведенные из реестра формулой (единицы измерения, гейт
 * дескриптора): проверяются отдельно — равенства с `defaultValue` тут нет.
 */
const DERIVED_FIELDS: Readonly<Record<string, readonly string[]>> = {
    LAG_CDF_DEFAULTS: ['minSales'],
    EDGE_GAP_PRACTICAL: ['prob'],
    FUNNEL_GAP_DEFAULTS: ['practicalDelta'],
};

/** Поля-константы метода: кода реестра нет, в исходнике стоит пометка. */
const LOCAL_FIELDS: Readonly<Record<string, readonly string[]>> = {
    KAPPA_DEFAULTS: [
        'lateFromMonths',
        'min',
        'gateMonths',
        'gateManagers',
        'poolPriorWeight',
    ],
    SHRINK_DEFAULTS: ['intervalKind'],
    SECTION_SHRINK_DEFAULTS: ['mMin', 'minGroups', 'minGroupSize'],
    RELIABILITY_DEFAULTS: ['notMeasuredNote'],
    QAV_DEFAULTS: ['sMin', 'sMax'],
    EDGE_ESTIMAND_DEFAULTS: ['estimand'],
    LEVER_DEFAULTS: ['z80'],
    BETA_POWER_DEFAULTS: ['pBar', 'sdScore', 'designEffect', 'gateMonths'],
    STAGE_THETA_DEFAULTS: ['mu'],
    AI_READINESS_GATE_DEFAULTS: ['calibrationPresentations'],
    CAPACITY_DEFAULTS: ['minManagers', 'minMonths'],
    FUNNEL_GAP_DEFAULTS: [
        'iterations',
        'permutationSamples',
        'lowQuantile',
        'highQuantile',
    ],
    NORM_HIERARCHY_DEFAULTS: [
        'minBandManagers',
        'bootMonths',
        'levelUnderstatedRatio',
    ],
};

/** Пометка локальной константы в исходнике модели. */
const LOCAL_MARKER = 'е параметр реестра';

const MODEL_DIR = join(__dirname, '..', 'model');

const objectOf = (name: string): DefaultsObject => {
    const entry = OBJECTS[name];
    if (!entry) {
        throw new Error(`Объект дефолтов ${name} не подключён к спеке`);
    }

    return entry.values;
};

const valueOf = (fieldPath: string): ParamPrimitive => {
    const [name, field] = fieldPath.split('.');
    const values = objectOf(name);
    if (!(field in values)) {
        throw new Error(`В ${name} нет поля ${field}`);
    }

    return values[field];
};

/** Сколько строк над объявлением поля считается его комментарием. */
const MARKER_LOOKBEHIND_LINES = 8;

/**
 * У поля есть пометка «не параметр реестра»: хотя бы одно его объявление
 * (строка вида `    field: значение,`) снабжено пометкой в комментарии над
 * ним. Проверка по месту, а не по файлу целиком: иначе одна пометка
 * закрывала бы все локальные поля файла.
 */
const hasLocalMarker = (source: string, field: string): boolean => {
    const lines = source.split(/\r?\n/);
    const declaration = new RegExp(`^\\s*${field}:`);

    return lines.some((line, index) => {
        if (!declaration.test(line)) {
            return false;
        }

        return lines
            .slice(Math.max(0, index - MARKER_LOOKBEHIND_LINES), index)
            .some(above => above.toLowerCase().includes(LOCAL_MARKER));
    });
};

const fieldsFromRegistry = (name: string): string[] =>
    REGISTRY_FIELDS.filter(([fieldPath]) => fieldPath.startsWith(`${name}.`))
        .map(([fieldPath]) => fieldPath.slice(name.length + 1))
        .filter((field, index, all) => all.indexOf(field) === index);

describe('*_DEFAULTS библиотеки: величины берутся из реестра параметров', () => {
    it.each(REGISTRY_FIELDS)('%s = defaultValue кода %s', (fieldPath, code) => {
        const descriptor = findParam(code);

        expect(descriptor).toBeDefined();
        expect(AI_ANALYTICS_PARAM_DEFAULTS[code]).toBe(
            descriptor?.defaultValue,
        );
        expect(valueOf(fieldPath)).toBe(AI_ANALYTICS_PARAM_DEFAULTS[code]);
    });

    it.each(Object.keys(OBJECTS))(
        '%s: каждое поле либо из реестра, либо выведено, либо локальное',
        name => {
            const covered = [
                ...fieldsFromRegistry(name),
                ...(DERIVED_FIELDS[name] ?? []),
                ...(LOCAL_FIELDS[name] ?? []),
            ];

            expect(Object.keys(objectOf(name)).sort()).toEqual(
                [...covered].sort(),
            );
        },
    );

    it.each(Object.keys(LOCAL_FIELDS))(
        '%s: у каждого локального поля своя пометка «не параметр реестра»',
        name => {
            const source = readFileSync(
                join(MODEL_DIR, OBJECTS[name].file),
                'utf8',
            );

            for (const field of LOCAL_FIELDS[name]) {
                expect({
                    field,
                    marked: hasLocalMarker(source, field),
                }).toEqual({ field, marked: true });
            }
        },
    );
});

describe('Поля, выведенные из реестра формулой', () => {
    it('LAG_CDF_DEFAULTS.minSales — гейт minN дескриптора lag_cdf_F', () => {
        const descriptor = findParam(LAG_CDF_PARAM_CODE);

        expect(descriptor?.minN).toBeGreaterThan(0);
        expect(LAG_CDF_DEFAULTS.minSales).toBe(descriptor?.minN);
    });

    it('EDGE_GAP_PRACTICAL.prob — delta_prac_pct реестра в доле', () => {
        const pct = AI_ANALYTICS_PARAM_DEFAULTS.delta_prac_pct;

        expect(typeof pct).toBe('number');
        expect(EDGE_GAP_PRACTICAL.prob).toBe(
            practicalDeltaFromPct(Number(pct)),
        );
        expect(EDGE_GAP_PRACTICAL.prob).toBe(
            Number(pct) / PERCENT_POINTS_IN_UNIT,
        );
    });

    it('FUNNEL_GAP_DEFAULTS.practicalDelta — тот же порог в доле', () => {
        expect(FUNNEL_GAP_DEFAULTS.practicalDelta).toBe(
            EDGE_GAP_PRACTICAL.prob,
        );
    });

    it('TIMESTAMP_LEAK_MAX — dq_timestamp_leak_max реестра', () => {
        expect(TIMESTAMP_LEAK_MAX).toBe(
            AI_ANALYTICS_PARAM_DEFAULTS.dq_timestamp_leak_max,
        );
    });
});

describe('registryEnumDefault: сужение строкового дефолта до словаря', () => {
    it('отдаёт дефолт кода, если он есть в словаре', () => {
        expect(
            registryEnumDefault('evidence_gate_advice', [
                'E0',
                'E1',
                'E2',
                'E3',
            ]),
        ).toBe(AI_ANALYTICS_PARAM_DEFAULTS.evidence_gate_advice);
    });

    it('бросает исключение на чужом словаре и неизвестном коде', () => {
        expect(() =>
            registryEnumDefault('evidence_gate_advice', ['E0', 'E1']),
        ).toThrow(/evidence_gate_advice/);
        expect(() => registryEnumDefault('нет такого кода', ['E0'])).toThrow();
    });
});
