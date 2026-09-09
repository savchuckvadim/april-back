import { STYLE_PROFILE_DEFAULTS } from '@lib/sales-ai-analytics';
import { toStyleProfile } from '../domain/presenter/style.presenter';
import type { StyleView } from '../domain/assembler/overview-model.types';

const tag = (code: string) => ({
    code,
    title: 'Больше выясняет, чем презентует',
    basis: 'выявление выше презентации на 1,2 балла',
    n: 62,
});

const styleView = (overrides: Partial<StyleView> = {}): StyleView => ({
    calls: 62,
    vector: { inquiry: 0.42 },
    tags: [tag('inquiry_high')],
    confidence: 'ok',
    ...overrides,
});

describe('toStyleProfile — профиль стиля в строке менеджера', () => {
    it('профиль с подписями, вектором и доверием', () => {
        expect(toStyleProfile(styleView())).toEqual({
            tags: [tag('inquiry_high')],
            vector: { inquiry: 0.42 },
            confidence: 'ok',
            calls: 62,
        });
    });

    it('разборов меньше style_min_calls (40) → профиля нет', () => {
        expect(
            toStyleProfile(
                styleView({ calls: STYLE_PROFILE_DEFAULTS.minCalls - 1 }),
            ),
        ).toBeNull();
        expect(
            toStyleProfile(
                styleView({ calls: STYLE_PROFILE_DEFAULTS.minCalls }),
            ),
        ).not.toBeNull();
    });

    it('доверие none (мало коллег) → профиля нет', () => {
        expect(
            toStyleProfile(styleView({ confidence: 'none', tags: [] })),
        ).toBeNull();
    });

    it('снапшота нет → профиля нет', () => {
        expect(toStyleProfile(null)).toBeNull();
        expect(toStyleProfile(undefined)).toBeNull();
    });

    it('подписей не больше трёх', () => {
        const profile = toStyleProfile(
            styleView({
                tags: ['a', 'b', 'c', 'd'].map(tag),
            }),
        );

        expect(profile?.tags).toHaveLength(3);
        expect(profile?.tags.map(item => item.code)).toEqual(['a', 'b', 'c']);
    });

    it('чужая форма: подпись без кода отбрасывается, нечисловые оси не берутся', () => {
        const profile = toStyleProfile(
            styleView({
                tags: [{ title: 'без кода' }, { code: 'x', title: 'ок' }],
                vector: { inquiry: 0.4, broken: 'нет' },
            }),
        );

        expect(profile?.tags).toEqual([
            { code: 'x', title: 'ок', basis: '', n: 0 },
        ]);
        expect(profile?.vector).toEqual({ inquiry: 0.4 });
    });

    it('доверие low отдаётся как есть — фронт покажет оговорку', () => {
        expect(
            toStyleProfile(styleView({ confidence: 'low' }))?.confidence,
        ).toBe('low');
    });
});
