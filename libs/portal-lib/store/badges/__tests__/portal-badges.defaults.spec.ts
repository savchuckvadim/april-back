import { DEFAULT_BADGES } from '../portal-badges.defaults';
import {
    BADGE_PLAN_TYPES,
    BADGE_TEXT_MAX_LENGTH,
    EnumBadgeTarget,
} from '../portal-badges.schema';

/*
 * Инварианты общего набора — те же, что проверяет сохранение своего
 * набора: общий набор не должен быть тем, что портал сохранить не смог бы.
 */
describe('DEFAULT_BADGES', () => {
    it('коды уникальны', () => {
        const codes = DEFAULT_BADGES.map(item => item.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('тексты непустые и не длиннее предела', () => {
        for (const item of DEFAULT_BADGES) {
            expect(item.text.trim()).toBe(item.text);
            expect(item.text.length).toBeGreaterThan(0);
            expect(item.text.length).toBeLessThanOrEqual(BADGE_TEXT_MAX_LENGTH);
        }
    });

    it('у комментария нет типов события, у названия нет итогов', () => {
        for (const item of DEFAULT_BADGES) {
            if (item.target === EnumBadgeTarget.comment) {
                expect(item.planTypes).toEqual([]);
                expect(item.isDefault).toBe(false);
            } else {
                expect(item.outcomes).toEqual([]);
            }
        }
    });

    /*
     * Согласованное «Звонок + имя клиента»: фрейм подставляет одно имя
     * клиента, слово типа добавляет заголовок задачи. Основной текст типа в
     * общем наборе дал бы «Звонок  Звонок — клиент».
     */
    it('основного текста типа в общем наборе нет', () => {
        expect(DEFAULT_BADGES.filter(item => item.isDefault)).toEqual([]);
    });

    it('бейджик названия не повторяет голое имя типа события', () => {
        const typeWords = new Set([
            'звонок',
            'холодный звонок',
            'презентация',
            'доработка',
            'решение',
            'оплата',
            'поставка',
        ]);
        for (const item of DEFAULT_BADGES) {
            if (item.target !== EnumBadgeTarget.title) continue;
            expect(typeWords.has(item.text.toLowerCase())).toBe(false);
            expect(item.planTypes.length).toBeLessThanOrEqual(
                BADGE_PLAN_TYPES.length,
            );
        }
    });

    /*
     * Решение владельца 27.10.2026: в группе «не дошёл до нужного человека»
     * профессии не называем — должность менеджер дописывает сам.
     */
    it('группа «не дошёл» без профессий', () => {
        const reach = DEFAULT_BADGES.filter(item =>
            item.code.startsWith('reach_'),
        );
        expect(reach.length).toBeGreaterThan(0);
        for (const item of reach) {
            expect(item.text).not.toMatch(/бухгалтер|юрист|кадров/i);
        }
    });

    // Группы «не дозвонился» нет: на gsirk её закрывает функция «недозвон».
    it('нет бейджиков про недозвон', () => {
        for (const item of DEFAULT_BADGES) {
            expect(item.text).not.toMatch(/недозвон|не дозвон|трубку/i);
        }
    });
});
