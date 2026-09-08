import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import { AiAnalyticsSnapshotsModule } from '../snapshots/ai-analytics-snapshots.module';
import { CallsStep } from '../steps/calls.step';
import { FinanceStep } from '../steps/finance.step';
import { KpiStep } from '../steps/kpi.step';
import { StyleStep } from '../steps/style.step';
import {
    exportsOf,
    metadataList,
    missingDependencies,
} from './fixtures/module-di.util';

/**
 * Срез менеджерских снапшотов подключается в сборку приложения как
 * отдельный модуль: его DI-граф обязан закрываться сам, иначе шаги
 * упадут на старте приложения, а не в тесте.
 */
describe('DI-граф AiAnalyticsSnapshotsModule', () => {
    it('все зависимости провайдеров доступны в модуле', () => {
        expect(
            missingDependencies(AiAnalyticsSnapshotsModule, [AppCacheService]),
        ).toEqual([]);
    });

    it('модуль экспортирует ровно четыре шага конвейера', () => {
        expect([...exportsOf(AiAnalyticsSnapshotsModule)]).toEqual([
            CallsStep,
            KpiStep,
            StyleStep,
            FinanceStep,
        ]);
    });

    it('срез не публикует контроллеров — поверхность API не растёт', () => {
        expect(metadataList(AiAnalyticsSnapshotsModule, 'controllers')).toEqual(
            [],
        );
        const leaking = metadataList(AiAnalyticsSnapshotsModule, 'imports')
            .filter(imported => imported.name !== 'BxDepartmentModule')
            .filter(
                imported => metadataList(imported, 'controllers').length > 0,
            )
            .map(imported => imported.name);
        expect(leaking).toEqual([]);
    });
});
