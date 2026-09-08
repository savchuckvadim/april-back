import {
    STYLE_PROFILE_DEFAULTS,
    StyleProfileOptions,
    StyleRow,
    buildStyleProfile,
} from '../model/style-profile';
import { STYLE_AXES, StyleAxisCode } from '../model/style-axes.const';

type AxisMeans = Partial<Record<StyleAxisCode, number>>;

/**
 * Единицы менеджера с точным средним и точным разбросом: половина строк
 * mean + spread, половина mean − spread (Σ(x−mean)² = n·spread²).
 * Случайности нет — расчёт стиля обязан быть воспроизводимым.
 */
const rowsOf = (
    managerId: string,
    means: AxisMeans,
    n: number,
    spread = 1,
): StyleRow[] =>
    Array.from({ length: n }, (_, index) => {
        const axes: AxisMeans = {};
        for (const code of STYLE_AXES) {
            const mean = means[code];
            if (mean !== undefined) {
                axes[code] = mean + (index % 2 === 0 ? spread : -spread);
            }
        }
        return { managerId, axes };
    });

/** K коллег со средними, симметрично разложенными вокруг нуля. */
const peerRows = (
    count: number,
    axes: readonly StyleAxisCode[],
    n = 40,
): StyleRow[] =>
    Array.from({ length: count }, (_, index) => {
        const mean = -0.5 + (index / Math.max(1, count - 1)) * 1;
        const means: AxisMeans = {};
        for (const axis of axes) {
            means[axis] = mean;
        }
        return rowsOf(`peer-${String(index).padStart(2, '0')}`, means, n);
    }).flat();

const CLOSER: StyleProfileOptions = { funnelShape: 'closer' };

describe('buildStyleProfile — подписи «по данным»', () => {
    it('закрыватель с высокой оценкой закрытия получает подпись «дожимает»', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('m-1', { persistence: 1 }, 84),
        ];

        const profile = buildStyleProfile(rows, 'm-1', CLOSER);

        expect(profile.confidence).toEqual({ level: 'ok' });
        expect(profile.funnelShape).toBe('closer');
        expect(profile.tags).toHaveLength(1);
        expect(profile.tags[0].code).toBe('persistent');
        expect(profile.tags[0].title).toBe('дожимает');
        expect(profile.tags[0].tier).toBe('data');
        expect(profile.tags[0].label).toContain('чаще коллег возвращается');
        expect(profile.tags[0].basis).toContain('n = 84');
        expect(profile.vector.persistence).toBeGreaterThan(0.5);
    });

    it('подписей не больше трёх, даже когда осей с отклонением больше', () => {
        const axes: StyleAxisCode[] = [
            'initiative',
            'inquiry',
            'persistence',
            'price_position',
            'tempo',
        ];
        const means: AxisMeans = {};
        for (const axis of axes) {
            means[axis] = 1;
        }
        const rows = [...peerRows(11, axes), ...rowsOf('m-1', means, 84)];

        const profile = buildStyleProfile(rows, 'm-1');

        expect(profile.axes).toHaveLength(axes.length);
        expect(profile.tags).toHaveLength(STYLE_PROFILE_DEFAULTS.maxTags);
        expect(profile.expectedFalseTags).toBeLessThan(0.5);
    });

    it('слабое отклонение подписи не даёт: ROPE и частотный пол не пройдены', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('m-1', { persistence: 0.05 }, 84),
        ];

        const profile = buildStyleProfile(rows, 'm-1');

        expect(profile.tags).toEqual([]);
        expect(profile.axes[0].pRope).toBeLessThan(0.5);
        expect(profile.confidence.level).toBe('ok');
    });
});

describe('buildStyleProfile — leave-one-out', () => {
    it('собственные данные менеджера не входят в среднее и разброс коллег', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('m-1', { persistence: 1 }, 84, 5),
        ];

        const axis = buildStyleProfile(rows, 'm-1').axes[0];

        // Норма коллег симметрична вокруг нуля: μ_LOO = 0, значит сырой
        // контраст равен собственному среднему менеджера.
        expect(axis.rawContrast).toBeCloseTo(1, 9);
        // Разброс единиц у менеджера впятеро больше, но σ_w считается по
        // коллегам: 40·11 единиц с разбросом 1 → σ_w ≈ 1,01.
        expect(axis.sigmaW).toBeGreaterThan(1);
        expect(axis.sigmaW).toBeLessThan(1.1);
    });

    it('коллега с n ниже порога в норму не входит', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('peer-short', { persistence: 5 }, 10),
            ...rowsOf('m-1', { persistence: 1 }, 84),
        ];

        const axis = buildStyleProfile(rows, 'm-1').axes[0];

        expect(axis.peers).toBe(11);
        expect(axis.rawContrast).toBeCloseTo(1, 9);
    });
});

describe('buildStyleProfile — честное «мало данных»', () => {
    it('менее 40 разборов за окно → confidence none и подписей нет', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('m-1', { persistence: 1 }, 30),
        ];

        const profile = buildStyleProfile(rows, 'm-1');

        expect(profile.calls).toBe(30);
        expect(profile.confidence).toEqual({
            level: 'none',
            reason: 'few-calls',
        });
        expect(profile.tags).toEqual([]);
        expect(profile.vector).toEqual({});
    });

    it('коллег в норме 6 (5–7) — только ярус «похоже» с оговоркой', () => {
        const rows = [
            ...peerRows(6, ['persistence']),
            ...rowsOf('m-1', { persistence: 1 }, 84),
        ];

        const profile = buildStyleProfile(rows, 'm-1');

        expect(profile.peers).toBe(6);
        expect(profile.confidence).toEqual({
            level: 'low',
            reason: 'few-peers',
        });
        expect(profile.tags[0].tier).toBe('likely');
        expect(profile.tags[0].label).toContain('похоже');
    });

    it('менее 5 коллег — сравнивать не с кем, подписей нет', () => {
        const rows = [
            ...peerRows(4, ['persistence']),
            ...rowsOf('m-1', { persistence: 1 }, 84),
        ];

        const profile = buildStyleProfile(rows, 'm-1');

        expect(profile.confidence).toEqual({
            level: 'none',
            reason: 'few-peers',
        });
        expect(profile.tags).toEqual([]);
    });

    it('коллеги неразличимы по оси — подписи нет, причина indistinguishable', () => {
        const peers = Array.from({ length: 11 }, (_, index) =>
            rowsOf(`peer-${index}`, { persistence: 0 }, 40),
        ).flat();
        const rows = [...peers, ...rowsOf('m-1', { persistence: 1 }, 84)];

        const profile = buildStyleProfile(rows, 'm-1');

        expect(profile.axes[0].confidence).toEqual({
            level: 'none',
            reason: 'indistinguishable',
        });
        expect(profile.tags).toEqual([]);
        expect(profile.vector).toEqual({});
    });
});

describe('buildStyleProfile — пороги реестра', () => {
    it('подпись прошлого окна держится гистерезисом style_p_out', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('m-1', { persistence: 0.35 }, 84),
        ];

        const fresh = buildStyleProfile(rows, 'm-1');
        const kept = buildStyleProfile(rows, 'm-1', {
            previousTags: ['persistent'],
        });

        expect(fresh.tags[0].tier).toBe('likely');
        expect(fresh.tags[0].kept).toBe(false);
        expect(kept.tags[0].tier).toBe('data');
        expect(kept.tags[0].kept).toBe(true);
        expect(kept.tags[0].pRope).toBeGreaterThanOrEqual(
            STYLE_PROFILE_DEFAULTS.pOut,
        );
    });

    it('оффсет полосы стажа снимает различие стажёров (style_tenure_kappa)', () => {
        const juniors = ['peer-00', 'peer-01', 'peer-02', 'peer-03', 'm-1'];
        const bands = Object.fromEntries(
            Array.from({ length: 11 }, (_, index) => [
                `peer-${String(index).padStart(2, '0')}`,
                index < 4 ? '0-6' : '18+',
            ]),
        );
        const rows = [
            ...peerRows(11, ['inquiry']),
            ...rowsOf('m-1', { inquiry: 0.6 }, 84),
        ];

        const plain = buildStyleProfile(rows, 'm-1');
        const withBands = buildStyleProfile(rows, 'm-1', {
            tenureBands: { ...bands, 'm-1': '0-6' },
        });

        expect(juniors).toContain('m-1');
        expect(Math.abs(withBands.axes[0].dTilde)).toBeLessThan(
            Math.abs(plain.axes[0].dTilde),
        );
    });

    it('интервал строится по style_interval_z (80 %)', () => {
        const rows = [
            ...peerRows(11, ['persistence']),
            ...rowsOf('m-1', { persistence: 1 }, 84),
        ];

        const axis = buildStyleProfile(rows, 'm-1').axes[0];
        const half = STYLE_PROFILE_DEFAULTS.intervalZ * axis.sdPost;

        expect(axis.ci80[0]).toBeCloseTo(axis.dTilde - half, 9);
        expect(axis.ci80[1]).toBeCloseTo(axis.dTilde + half, 9);
    });

    it('расчёт детерминирован и не зависит от порядка строк', () => {
        const rows = [
            ...peerRows(11, ['persistence', 'tempo']),
            ...rowsOf('m-1', { persistence: 1, tempo: -0.8 }, 84),
        ];

        const direct = buildStyleProfile(rows, 'm-1');
        const reversed = buildStyleProfile([...rows].reverse(), 'm-1');

        // Повтор на том же входе — побитово те же числа.
        expect(buildStyleProfile(rows, 'm-1')).toEqual(direct);
        // Другой порядок строк — расхождение только в пределах 1e-9
        // (порядок суммирования чисел с плавающей точкой).
        expect(reversed.tags.map(tag => tag.code)).toEqual(
            direct.tags.map(tag => tag.code),
        );
        reversed.axes.forEach((axis, index) => {
            expect(axis.dTilde).toBeCloseTo(direct.axes[index].dTilde, 9);
            expect(axis.pRope).toBeCloseTo(direct.axes[index].pRope, 9);
        });
    });
});
