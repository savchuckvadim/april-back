import { mergeDynamicSmartBinding } from '../install-const-smart.service';

/**
 * Merge settings crm-поля при привязке к динамическому типу смарта.
 *
 * Формат settings crm-поля (userfieldconfig, apidocs): булевы Y/N-ключи
 * LEAD/CONTACT/COMPANY/DEAL/QUOTE/ORDER/SMART_INVOICE + DYNAMIC_{entityTypeId}
 * для смарт-процессов. Ключевой инвариант — ДОЛИВКА, не замена: существующие
 * привязки поля (в т.ч. чужие DYNAMIC_*) обязаны пережить установку смарта.
 */
describe('mergeDynamicSmartBinding', () => {
    it('доливает DYNAMIC_{entityTypeId}=Y, сохраняя существующие привязки', () => {
        const { changed, settings } = mergeDynamicSmartBinding(
            { DEAL: 'Y', COMPANY: 'N', DYNAMIC_1038: 'Y' },
            1040,
        );
        expect(changed).toBe(true);
        expect(settings).toEqual({
            DEAL: 'Y',
            COMPANY: 'N',
            DYNAMIC_1038: 'Y',
            DYNAMIC_1040: 'Y',
        });
    });

    it('пустые/отсутствующие settings — создаёт объект с одной привязкой', () => {
        expect(mergeDynamicSmartBinding(undefined, 1040)).toEqual({
            changed: true,
            settings: { DYNAMIC_1040: 'Y' },
        });
        expect(mergeDynamicSmartBinding({}, 1040).settings).toEqual({
            DYNAMIC_1040: 'Y',
        });
    });

    it('уже привязано — no-op (идемпотентность повторной установки)', () => {
        const current = { DEAL: 'Y', DYNAMIC_1040: 'Y' };
        const { changed, settings } = mergeDynamicSmartBinding(current, 1040);
        expect(changed).toBe(false);
        expect(settings).toBe(current);
    });

    it("явное 'N' у нужного ключа перебивается на 'Y'", () => {
        const { changed, settings } = mergeDynamicSmartBinding(
            { DYNAMIC_1040: 'N' },
            1040,
        );
        expect(changed).toBe(true);
        expect(settings.DYNAMIC_1040).toBe('Y');
    });

    it('исходный объект не мутируется', () => {
        const current = { DEAL: 'Y' };
        mergeDynamicSmartBinding(current, 1040);
        expect(current).toEqual({ DEAL: 'Y' });
    });
});
