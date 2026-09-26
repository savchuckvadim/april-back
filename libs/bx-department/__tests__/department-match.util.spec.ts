import { EDepartamentGroup } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    collectUsers,
    isGroupName,
    matchesName,
    resolvePatterns,
    tagCacheKey,
} from '../lib/department-match.util';

describe('department-match.util', () => {
    it('tagCacheKey: пробелы → дефис, регистр вниз, пусто → default', () => {
        expect(tagCacheKey('ОП  ОС')).toBe('оп-ос');
        expect(tagCacheKey('  ')).toBe('default');
        expect(tagCacheKey(null)).toBe('default');
    });

    it('resolvePatterns: без тэга — шаблоны группы', () => {
        const patterns = resolvePatterns(EDepartamentGroup.sales, null);

        expect(matchesName('ОП Ростов', patterns)).toBe(true);
        expect(matchesName('Отдел продаж Москва', patterns)).toBe(true);
        expect(matchesName('ОПТ склад', patterns)).toBe(false);
        expect(resolvePatterns(EDepartamentGroup.tmc, null)).toEqual([]);
    });

    it('resolvePatterns: тэг — префиксы со словограницей, скобки — подстрока', () => {
        const byPrefix = resolvePatterns(EDepartamentGroup.sales, 'ОП, ОС');
        expect(matchesName('ОС Питер', byPrefix)).toBe(true);
        expect(matchesName('ОПТ склад', byPrefix)).toBe(false);

        const byMarker = resolvePatterns(EDepartamentGroup.sales, '(ОП)');
        expect(matchesName('Воронеж (ОП)', byMarker)).toBe(true);
        expect(matchesName('ОП Воронеж', byMarker)).toBe(false);
    });

    it('isGroupName: только подотделы «Группа …»', () => {
        expect(isGroupName(' Группа Звездочки ')).toBe(true);
        expect(isGroupName('Стажеры')).toBe(false);
    });

    it('collectUsers: уникальные по ID, отделы без USERS пропускаются', () => {
        const users = collectUsers([
            { ID: 1, NAME: 'a', PARENT: '0', SORT: 1, USERS: [{ ID: 5 }] },
            {
                ID: 2,
                NAME: 'b',
                PARENT: '1',
                SORT: 1,
                USERS: [{ ID: '5' }, { ID: 6 }],
            },
            { ID: 3, NAME: 'c', PARENT: '1', SORT: 1, USERS: null },
        ]);

        expect(users.map(user => Number(user.ID))).toEqual([5, 6]);
    });
});
