import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import { AiAnalyticsPlanController } from '../ai-analytics-plan.controller';
import { AiAnalyticsPlanModule } from '../plan/ai-analytics-plan.module';
import { DailyPlanUseCase } from '../domain/use-cases/daily-plan.use-case';
import {
    dependenciesOf,
    exportsOf,
    metadataList,
    missingDependencies,
} from './fixtures/module-di.util';

/**
 * Срез плана дня подключается в сборку приложения отдельным модулем: его
 * DI-граф обязан закрываться сам, иначе контроллер упадёт на старте
 * приложения, а не в тесте (тот же подход, что у
 * `snapshots-module-di.spec.ts`).
 */
describe('DI-граф AiAnalyticsPlanModule', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        expect(
            missingDependencies(AiAnalyticsPlanModule, [AppCacheService]),
        ).toEqual([]);
    });

    it('модуль публикует ровно один контроллер плана дня', () => {
        expect(metadataList(AiAnalyticsPlanModule, 'controllers')).toEqual([
            AiAnalyticsPlanController,
        ]);
    });

    it('чужие контроллеры через импорты не текут в поверхность API', () => {
        const leaking = metadataList(AiAnalyticsPlanModule, 'imports')
            .filter(imported => imported.name !== 'BxDepartmentModule')
            .filter(
                imported => metadataList(imported, 'controllers').length > 0,
            )
            .map(imported => imported.name);
        expect(leaking).toEqual([]);
    });

    it('модуль экспортирует сценарий плана дня', () => {
        expect([...exportsOf(AiAnalyticsPlanModule)]).toEqual([
            DailyPlanUseCase,
        ]);
    });

    it('ни один провайдер среза не зависит от PBXService — Битрикс не нужен', () => {
        const names = [
            ...metadataList(AiAnalyticsPlanModule, 'providers'),
            ...metadataList(AiAnalyticsPlanModule, 'controllers'),
        ].flatMap(unit => dependenciesOf(unit).map(dep => dep.name));

        expect(names).not.toContain('PBXService');
        expect(
            metadataList(AiAnalyticsPlanModule, 'imports').map(
                imported => imported.name,
            ),
        ).not.toContain('PBXModule');
    });
});
