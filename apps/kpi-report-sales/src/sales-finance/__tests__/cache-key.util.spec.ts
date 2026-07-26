import {
    buildClosedMonthKey,
    buildClosedResultKey,
    buildEmployeesKey,
    buildHotClientsKey,
    buildResetPattern,
} from '../cache/cache-key.util';

describe('cache-key.util', () => {
    it('нормализует сотрудников: сортировка и дедупликация', () => {
        expect(buildEmployeesKey([456, 123, 456])).toBe('123_456');
    });

    it("пустой фильтр сотрудников даёт 'all'", () => {
        expect(buildEmployeesKey()).toBe('all');
        expect(buildEmployeesKey([])).toBe('all');
    });

    it('ключ месячного сегмента содержит домен, месяц и сотрудников', () => {
        expect(
            buildClosedMonthKey('april.bitrix24.ru', '2026-03', [2, 1]),
        ).toBe('sales-finance:v3:april.bitrix24.ru:closed:month:2026-03:1_2');
    });

    it('ключ итога содержит период и сотрудников', () => {
        expect(
            buildClosedResultKey(
                'april.bitrix24.ru',
                '2026-01-01',
                '2026-06-30',
                [1],
            ),
        ).toBe(
            'sales-finance:v3:april.bitrix24.ru:closed:result:2026-01-01_2026-06-30_1',
        );
    });

    it('ключ горячих клиентов содержит порог', () => {
        expect(buildHotClientsKey('april.bitrix24.ru', 'document')).toBe(
            'sales-finance:v3:april.bitrix24.ru:hot:document:all',
        );
    });

    it('паттерны сброса по scope', () => {
        expect(buildResetPattern('d.ru', 'all')).toBe(
            'sales-finance:v3:d.ru:*',
        );
        expect(buildResetPattern('d.ru', 'closed')).toBe(
            'sales-finance:v3:d.ru:closed:*',
        );
        expect(buildResetPattern('d.ru', 'hot')).toBe(
            'sales-finance:v3:d.ru:hot:*',
        );
    });
});
