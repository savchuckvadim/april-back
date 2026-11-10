import { legacyText } from '../lib/legacy-text.util';

describe('legacyText — имя сделки из легаси-избранного', () => {
    it('объект поля ввода — его value; пустой — null', () => {
        expect(legacyText('{"value":"ООО Ромашка"}')).toBe('ООО Ромашка');
        expect(legacyText('{"value":""}')).toBeNull();
    });

    it('обычный текст и пустота', () => {
        expect(legacyText(' Сделка 12 ')).toBe('Сделка 12');
        expect(legacyText('')).toBeNull();
        expect(legacyText(null)).toBeNull();
        expect(legacyText('{не json}')).toBe('{не json}');
    });
});
