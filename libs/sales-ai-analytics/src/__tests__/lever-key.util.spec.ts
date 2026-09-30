import {
    isHashedLeverKey,
    LEVER_KEY_MAX_LENGTH,
    leverKeyOf,
    parseLeverKey,
    safeLeverKeyPart,
} from '../model/lever-key.util';
import { AI_LEVERS } from '../model/lever.types';

/**
 * Ключ рекомендации (Фаза 4, П18): детерминирован, пятичастный, без
 * пробелов, ≤ 120 символов, разбирается обратно; при переполнении хвост
 * хэшируется, а рычаг остаётся читаемым.
 */
describe('leverKeyOf — сборка ключа', () => {
    it('собирает lever:ruleCode:callType:section:category', () => {
        expect(
            leverKeyOf({
                lever: 'quality',
                ruleCode: 'quality-below-norm',
                callType: 'presentation',
                section: 'price',
                category: undefined,
            }),
        ).toBe('quality:quality-below-norm:presentation:price:');
    });

    it('пустые части — пустые строки между разделителями', () => {
        expect(
            leverKeyOf({ lever: 'volume', ruleCode: 'volume-below-capacity' }),
        ).toBe('volume:volume-below-capacity:::');
    });

    it('детерминирован: два вызова дают одну строку', () => {
        const source = {
            lever: 'objection' as const,
            ruleCode: 'objection-worst-outcome',
            category: 'price',
        };
        expect(leverKeyOf(source)).toBe(leverKeyOf(source));
    });

    it('пробелы, разделители и маркер внутри частей заменяются', () => {
        const key = leverKeyOf({
            lever: 'checklist',
            ruleCode: 'next step:with#date',
            section: 'a b',
        });
        expect(key).toBe('checklist:next_step_with_date::a_b:');
        expect(key).not.toMatch(/\s/);
        expect(safeLeverKeyPart(' x:y#z ')).toBe('_x_y_z_');
    });
});

describe('parseLeverKey — разбор', () => {
    it('разбирает ключ обратно на части для каждого рычага', () => {
        for (const lever of AI_LEVERS) {
            const source = {
                lever,
                ruleCode: `${lever}-rule`,
                callType: 'cold',
                section: 'greeting',
                category: 'price',
            };
            expect(parseLeverKey(leverKeyOf(source))).toEqual(source);
        }
    });

    it('отсутствовавшие части возвращаются пустыми строками', () => {
        expect(
            parseLeverKey(
                leverKeyOf({ lever: 'pipeline', ruleCode: 'pipeline-hot' }),
            ),
        ).toEqual({
            lever: 'pipeline',
            ruleCode: 'pipeline-hot',
            callType: '',
            section: '',
            category: '',
        });
    });

    it('не ключ → null: чужой рычаг, пустое правило, не пять частей, пробел', () => {
        expect(parseLeverKey('speed:rule:::')).toBeNull();
        expect(parseLeverKey('volume::::')).toBeNull();
        expect(parseLeverKey('volume:rule')).toBeNull();
        expect(parseLeverKey('volume:rule:a:b:c:d')).toBeNull();
        expect(parseLeverKey('volume:ru le:::')).toBeNull();
        expect(parseLeverKey('')).toBeNull();
    });

    it('слишком длинная строка → null', () => {
        expect(
            parseLeverKey(`volume:${'r'.repeat(LEVER_KEY_MAX_LENGTH)}:::`),
        ).toBeNull();
    });
});

describe('leverKeyOf — переполнение', () => {
    const longTail = {
        lever: 'quality' as const,
        ruleCode: 'quality-below-norm',
        callType: 'c'.repeat(60),
        section: 's'.repeat(60),
        category: 'k'.repeat(60),
    };

    it('ключ ≤ 120 символов, хвост хэширован, рычаг и правило целы', () => {
        const key = leverKeyOf(longTail);
        expect(key.length).toBeLessThanOrEqual(LEVER_KEY_MAX_LENGTH);
        expect(isHashedLeverKey(key)).toBe(true);
        const parts = parseLeverKey(key);
        expect(parts).not.toBeNull();
        expect(parts?.lever).toBe('quality');
        expect(parts?.ruleCode).toBe('quality-below-norm');
        expect(parts?.callType).toMatch(/^#[0-9a-f]{8}$/);
        expect(parts?.section).toBe('');
        expect(parts?.category).toBe('');
    });

    it('разные хвосты дают разные хэши, один хвост — один ключ', () => {
        const other = { ...longTail, category: 'x'.repeat(60) };
        expect(leverKeyOf(longTail)).toBe(leverKeyOf({ ...longTail }));
        expect(leverKeyOf(longTail)).not.toBe(leverKeyOf(other));
    });

    it('слишком длинное правило хэшируется вместе с хвостом, рычаг остаётся', () => {
        const key = leverKeyOf({
            lever: 'volume',
            ruleCode: 'r'.repeat(LEVER_KEY_MAX_LENGTH + 5),
        });
        expect(key.length).toBeLessThanOrEqual(LEVER_KEY_MAX_LENGTH);
        const parts = parseLeverKey(key);
        expect(parts?.lever).toBe('volume');
        expect(parts?.ruleCode).toMatch(/^#[0-9a-f]{8}$/);
    });

    it('обычный ключ не считается хэшированным', () => {
        expect(
            isHashedLeverKey(leverKeyOf({ lever: 'volume', ruleCode: 'r' })),
        ).toBe(false);
    });
});
