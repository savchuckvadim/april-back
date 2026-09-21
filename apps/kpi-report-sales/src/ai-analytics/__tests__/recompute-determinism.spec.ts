import { AI_ANALYTICS_CALC_VERSION } from '../constants/ai-overview.const';
import {
    recomputeForecast,
    recomputeModel,
    recomputeModelInput,
    recomputeSeed,
    RECOMPUTE_MODEL_ID,
    RECOMPUTE_PARAMS_VERSION,
} from './fixtures/recompute.fixture';

/**
 * Воспроизводимость пересчёта (план §6, приёмка «|Δ| ≤ 1e-9 при том же seed
 * и версии параметров»): на одной фикстуре (строки разборов + история
 * стадий + KPI) модель портала и прогноз дня собираются дважды — все
 * числовые поля нагрузок совпадают с точностью 1e-9 (рекурсивный обход),
 * структура и строки совпадают целиком, `meta.modelSnapshotId` тот же.
 * Третий прогон прогноза с другим seed даёт другие утечки — доказательство,
 * что seed действительно входит в расчёт, а не декларирован.
 *
 * Версия Node в `meta` не вводится: `AiSnapshotMeta.calcVersion` — версия
 * кода расчёта (`AI_ANALYTICS_CALC_VERSION`), она и закрепляется; версия
 * рантайма — свойство развёртывания, а не входа расчёта.
 */
const TOLERANCE = 1e-9;

type NumericLeaves = Map<string, number>;

/** Все числовые листья значения с путями `$.a.b[2].c`. */
function numericLeaves(
    value: unknown,
    path = '$',
    out: NumericLeaves = new Map(),
): NumericLeaves {
    if (typeof value === 'number') {
        out.set(path, value);
    } else if (Array.isArray(value)) {
        value.forEach((item, index) =>
            numericLeaves(item, `${path}[${index}]`, out),
        );
    } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            numericLeaves(item, `${path}.${key}`, out);
        }
    }
    return out;
}

/** Та же нагрузка, где каждое число заменено маркером: сравнение формы и строк. */
const shapeOf = (value: unknown): string =>
    JSON.stringify(value, (_, item: unknown) =>
        typeof item === 'number' ? 'N' : item,
    );

/** Пути числовых листьев, отличающихся больше допуска. */
function numericDiffs(first: unknown, second: unknown): string[] {
    const a = numericLeaves(first);
    const b = numericLeaves(second);
    const paths = new Set([...a.keys(), ...b.keys()]);
    return [...paths].filter(path => {
        const x = a.get(path);
        const y = b.get(path);
        return (
            x === undefined || y === undefined || Math.abs(x - y) > TOLERANCE
        );
    });
}

describe('recompute: модель портала воспроизводима по тем же входам', () => {
    const first = recomputeModel();
    const second = recomputeModel();

    it('фикстура не пустая: рёбра, нормы обоих менеджеров, θ и шкала лага', () => {
        expect(first.edges.length).toBeGreaterThan(0);
        expect(first.managerNorms.map(norm => norm.managerId)).toEqual([
            '10',
            '20',
        ]);
        expect(first.stageTheta.length).toBeGreaterThan(0);
        expect(first.lagCdf.points.length).toBeGreaterThan(0);
        expect(numericLeaves(first).size).toBeGreaterThan(50);
    });

    it('все числовые поля совпадают с точностью 1e-9, форма и строки — целиком', () => {
        expect(numericDiffs(first, second)).toEqual([]);
        expect(shapeOf(second)).toBe(shapeOf(first));
    });

    it('meta: версия кода, версия параметров и идентификатор модели совпадают', () => {
        expect(first.meta.calcVersion).toBe(AI_ANALYTICS_CALC_VERSION);
        expect(second.meta).toEqual(first.meta);
        expect(first.meta.paramsVersion).toBe(RECOMPUTE_PARAMS_VERSION);
        expect(first.meta.modelSnapshotId).toBeNull();
    });
});

describe('recompute: прогноз дня воспроизводим по seed и paramsVersion', () => {
    const model = recomputeModel();
    const months = recomputeModelInput().months;
    const seed = recomputeSeed('10');
    const first = recomputeForecast(model, months, '10', seed);
    const second = recomputeForecast(model, months, '10', seed);

    it('фикстура не пустая: пайплайн посчитан, утечки с ожиданием есть', () => {
        expect(first.pipelineExpected).not.toBeNull();
        expect(first.leaks.length).toBeGreaterThan(0);
        expect(first.leaks.some(leak => leak.expected !== null)).toBe(true);
        expect(first.plan.items.length).toBeGreaterThan(0);
    });

    it('тот же seed → все числовые поля равны с точностью 1e-9, форма та же', () => {
        expect(numericDiffs(first, second)).toEqual([]);
        expect(shapeOf(second)).toBe(shapeOf(first));
    });

    it('meta.modelSnapshotId и версии совпадают между прогонами', () => {
        expect(first.meta.modelSnapshotId).toBe(RECOMPUTE_MODEL_ID);
        expect(second.meta.modelSnapshotId).toBe(first.meta.modelSnapshotId);
        expect(first.meta.calcVersion).toBe(AI_ANALYTICS_CALC_VERSION);
        expect(first.meta.paramsVersion).toBe(RECOMPUTE_PARAMS_VERSION);
    });

    it('другой seed меняет утечки, но не детерминированные числа', () => {
        const other = recomputeForecast(model, months, '10', seed + 1);

        const leakDiffs = numericDiffs(first.leaks, other.leaks);
        expect(leakDiffs.length).toBeGreaterThan(0);
        expect(
            leakDiffs.every(path => /\.(expected|ci90)\b|\.ci90\[/.test(path)),
        ).toBe(true);
        expect(other.p50).toBe(first.p50);
        expect(other.requiredVolume).toBe(first.requiredVolume);
        expect(other.pipelineExpected).toBe(first.pipelineExpected);
        expect(other.doneSales).toBe(first.doneSales);
    });

    it('другой менеджер с тем же seed-ключом считается по своим входам', () => {
        const another = recomputeForecast(
            model,
            months,
            '20',
            recomputeSeed('20'),
        );
        expect(another.doneSales).not.toBe(first.doneSales);
        expect(another.meta.modelSnapshotId).toBe(RECOMPUTE_MODEL_ID);
    });
});
