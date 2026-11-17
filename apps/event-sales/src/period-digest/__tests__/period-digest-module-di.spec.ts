import { AppCacheService } from '@lib/app-cache';
import {
    ctorsOf,
    dependenciesOf,
    missingDependencies,
} from '../../shared/testing/module-di-graph.util';
import { isWorkdayOf } from '../adapters/period-digest-calendar.adapter';
import { PeriodDigestModule } from '../period-digest.module';
import { fallbackWorkingHours } from '../../shared/working-hours/working-hours.model';

/**
 * Статическая проверка DI-графа модуля итогов периода: каждая зависимость
 * конструктора провайдера обязана быть доступна в модуле, в экспортах его
 * импортов или в белом списке глобальных. Юнит-тесты работают на моках, и
 * забытый импорт виден только при старте приложения — уже в проде.
 */

/** AppCacheServiceModule — @Global и импортирован корнем event-sales. */
const GLOBALS = [AppCacheService];

describe('DI-граф PeriodDigestModule (event-sales)', () => {
    it('все зависимости провайдеров доступны в модуле', () => {
        expect(missingDependencies(PeriodDigestModule, GLOBALS)).toEqual([]);
    });

    it('метаданные конструкторов читаются — проверка выше не пустая', () => {
        const withDependencies = ctorsOf(
            PeriodDigestModule,
            'providers',
        ).filter(target => dependenciesOf(target).length > 0);
        expect(withDependencies.map(target => target.name)).toEqual(
            expect.arrayContaining([
                'PeriodDigestDefinition',
                'PeriodDigestCardsService',
                'PeriodDigestCardStore',
                'PeriodDigestRunProcessor',
            ]),
        );
    });
});

describe('календарь портала для итогов периода', () => {
    it('рабочий день — не выходной и не праздник по графику портала', () => {
        const hours = fallbackWorkingHours();

        expect(isWorkdayOf(hours, '2026-11-17')).toBe(true);
        // Суббота.
        expect(isWorkdayOf(hours, '2026-11-21')).toBe(false);
        // 4 ноября — праздник.
        expect(isWorkdayOf(hours, '2026-11-04')).toBe(false);
    });
});
