import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { BxDepartmentModule } from '@lib/bx-department';
import { TelegramModule } from '@lib/telegram/telegram.module';
import { PBXModule } from 'src/modules/pbx/pbx.module';
import { AiAnalyticsModule } from '../../ai-analytics/ai-analytics.module';
import { CallListPointsProvider } from '../../ai-analytics/calls/calls-list-points.provider';
import { AiAnalyticsCoreModule } from '../../ai-analytics/core/ai-analytics-core.module';
import {
    exportsOf,
    metadataList,
    missingDependencies,
    type Ctor,
} from '../../ai-analytics/__tests__/fixtures/module-di.util';
import { PortalViewController } from '../portal-view.controller';
import { PortalViewIndicatorsService } from '../portal-view-indicators.service';
import { PortalViewModule } from '../portal-view.module';
import { PortalViewReader } from '../portal-view.reader';
import { PortalViewUseCase } from '../portal-view.use-case';

/**
 * Глобальные провайдеры приложения: ConfigService — ConfigModule.forRoot
 * корня kpi-report-sales (isGlobal), поэтому сам модуль его не импортирует.
 */
const GLOBAL_PROVIDERS: Ctor[] = [ConfigService];

/**
 * Поддеревья, чьи роуты приложение публикует и без этого модуля: их
 * контроллеры — забота владельцев (PBXModule несёт TelegramController и
 * FrontPortalController с Фазы 1a AI-аналитики).
 */
const APP_PUBLISHED_SUBTREES = new Set<Ctor>([
    BxDepartmentModule,
    TelegramModule,
    PBXModule,
]);

/** Транзитивные импорты без поддеревьев, опубликованных приложением. */
function importsDeep(module: Ctor, seen = new Set<Ctor>([module])): Ctor[] {
    return metadataList(module, 'imports').flatMap(imported => {
        if (seen.has(imported) || APP_PUBLISHED_SUBTREES.has(imported)) {
            return [];
        }
        seen.add(imported);
        return [imported, ...importsDeep(imported, seen)];
    });
}

describe('DI-граф PortalViewModule', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        expect(missingDependencies(PortalViewModule, GLOBAL_PROVIDERS)).toEqual(
            [],
        );
    });

    it('модуль публикует ровно одну ручку-контроллер и отдаёт наружу только читатель вида', () => {
        expect(metadataList(PortalViewModule, 'controllers')).toEqual([
            PortalViewController,
        ]);
        expect([...exportsOf(PortalViewModule)]).toEqual([PortalViewReader]);
    });

    it('источник пунктов методики и use-case объявлены в самом модуле', () => {
        const providers = metadataList(PortalViewModule, 'providers');
        expect(providers).toContain(CallListPointsProvider);
        expect(providers).toContain(PortalViewUseCase);
        expect(providers).toContain(PortalViewIndicatorsService);
    });

    it('ни один импорт (включая транзитивные) не несёт лишних контроллеров', () => {
        const leaking = importsDeep(PortalViewModule)
            .filter(imported => metadataList(imported, 'controllers').length)
            .map(imported => imported.name);

        expect(leaking).toEqual([]);
        // Проверка не пустая: цепочки методики и ядра действительно раскрыты.
        const names = importsDeep(PortalViewModule).map(module => module.name);
        expect(names).toContain('MethodologyModule');
        expect(names).toContain('PortalAppSettingsModule');
    });

    it('ядро AI-аналитики берётся ради прав, а сам модуль не входит в AiAnalyticsModule: ручки работают и при выключенном AI', () => {
        const names = importsDeep(PortalViewModule).map(module => module.name);
        expect(metadataList(PortalViewModule, 'imports')).toContain(
            AiAnalyticsCoreModule,
        );
        expect(names).not.toContain(AiAnalyticsModule.name);
        expect(names).not.toContain('AiAnalyticsCallsModule');

        expect(metadataList(AiAnalyticsModule, 'imports')).not.toContain(
            PortalViewModule,
        );
    });
});
