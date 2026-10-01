import { AppCacheService } from '@lib/app-cache';
import {
    ctorsOf,
    dependenciesOf,
    missingDependencies,
} from '../../shared/testing/module-di-graph.util';
import { DuplicateReportModule } from '../duplicate-report.module';

/**
 * Статическая проверка DI-графа модуля отчёта по дублям: каждая
 * зависимость конструктора провайдера и контроллера обязана быть доступна
 * в модуле, в экспортах его импортов или в белом списке глобальных.
 *
 * ЗАЧЕМ: юнит-тесты работают на моках, и забытый импорт модуля виден
 * только при старте приложения — то есть уже в проде (боевой случай
 * 27.08.2026: event-sales не поднялся, 502).
 */

/** AppCacheServiceModule — @Global и импортирован корнем event-sales. */
const GLOBALS = [AppCacheService];

describe('DI-граф DuplicateReportModule (event-sales)', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        expect(missingDependencies(DuplicateReportModule, GLOBALS)).toEqual([]);
    });

    it('метаданные конструкторов читаются — проверка выше не пустая', () => {
        const withDependencies = ctorsOf(
            DuplicateReportModule,
            'providers',
        ).filter(target => dependenciesOf(target).length > 0);
        expect(withDependencies.map(target => target.name)).toEqual(
            expect.arrayContaining([
                'DuplicateReportService',
                'DuplicateReportScheduler',
                'DuplicateReportRunState',
            ]),
        );
    });
});
