import { closedSatelliteLabel } from '../lib/closed-satellite-label';

describe('closedSatelliteLabel', () => {
    it('воронка — названием с портала, без кода', () => {
        expect(
            closedSatelliteLabel(
                { title: 'ОП Холодные', name: 'sales_xo' },
                96225,
                'Холодный обзвон Юрист СПБ26',
            ),
        ).toBe('ОП Холодные #96225 «Холодный обзвон Юрист СПБ26»');
    });

    it('нет заголовка — берётся имя категории', () => {
        expect(
            closedSatelliteLabel({ title: '', name: 'ОП Презентации' }, 1, 'Х'),
        ).toBe('ОП Презентации #1 «Х»');
    });

    it('категория не найдена — нейтральное «Сделка»', () => {
        expect(closedSatelliteLabel(undefined, 2, 'Y')).toBe('Сделка #2 «Y»');
    });
});
