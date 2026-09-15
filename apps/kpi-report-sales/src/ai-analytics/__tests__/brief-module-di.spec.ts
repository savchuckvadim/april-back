import 'reflect-metadata';
import { AppCacheService } from '@lib/app-cache';
import { BxDepartmentModule } from '@lib/bx-department';
import { WsService } from '@/core/ws';
import { AiAnalyticsBriefController } from '../ai-analytics-brief.controller';
import { AI_BRIEF_LLM_PORT } from '../brief/ai-brief-llm.port';
import { AiAnalyticsBriefModule } from '../brief/ai-analytics-brief.module';
import { VibeCodeBriefAdapter } from '../brief/vibecode-brief.adapter';
import { BriefJobUseCase } from '../domain/use-cases/brief-job.use-case';
import { BriefUseCase } from '../domain/use-cases/brief.use-case';
import {
    exportsOf,
    metadataList,
    missingDependencies,
    type Ctor,
} from './fixtures/module-di.util';

/**
 * Срез резюме подключается в сборку приложения отдельным модулем: его
 * DI-граф обязан закрываться сам, а импорт VibecodeModule не должен
 * тянуть в Swagger приложения чужие роуты (риск потока 18 — проверяем
 * ВЕСЬ транзитивный список импортов, а не только прямые).
 */

/**
 * Модули, в которые импорт уходит рекурсивно (с защитой от циклов).
 * Поддерево BxDepartmentModule не раскрывается: общий модуль структуры
 * отделов тянет за собой половину приложения (PBXModule, PortalModule,
 * TelegramModule) и подключён в приложении задолго до резюме — от среза
 * он не зависит, и его поверхность — забота его владельца.
 */
function importsDeep(module: Ctor, seen = new Set<Ctor>()): Ctor[] {
    if (seen.has(module)) return [];
    seen.add(module);

    return metadataList(module, 'imports').flatMap(imported =>
        imported === BxDepartmentModule
            ? []
            : [imported, ...importsDeep(imported, seen)],
    );
}

describe('DI-граф AiAnalyticsBriefModule', () => {
    it('все зависимости провайдеров и контроллера доступны в модуле', () => {
        expect(
            missingDependencies(AiAnalyticsBriefModule, [
                AppCacheService,
                WsService,
            ]),
        ).toEqual([]);
    });

    it('порт модели закрыт адаптером VibeCode', () => {
        const providers =
            (Reflect.getMetadata('providers', AiAnalyticsBriefModule) as
                | unknown[]
                | undefined) ?? [];
        const port = providers.find(
            (provider): provider is { provide: string; useExisting: Ctor } =>
                typeof provider === 'object' &&
                provider !== null &&
                (provider as { provide?: unknown }).provide ===
                    AI_BRIEF_LLM_PORT,
        );

        expect(port?.useExisting).toBe(VibeCodeBriefAdapter);
    });

    it('модуль публикует только свою ручку и экспортирует оба use-case’а', () => {
        expect(metadataList(AiAnalyticsBriefModule, 'controllers')).toEqual([
            AiAnalyticsBriefController,
        ]);
        expect([...exportsOf(AiAnalyticsBriefModule)]).toEqual([
            BriefUseCase,
            BriefJobUseCase,
        ]);
    });

    it('ни один импорт (включая транзитивные VibecodeModule) не несёт контроллеров', () => {
        const deep = importsDeep(AiAnalyticsBriefModule);
        const leaking = deep
            .filter(imported => metadataList(imported, 'controllers').length)
            .map(imported => imported.name);

        expect(leaking).toEqual([]);
        // Проверка не пустая: цепочка модели действительно раскрыта.
        const names = deep.map(module => module.name);
        expect(names).toContain('VibecodeModule');
        expect(names).toContain('PortalStoreModule');
    });

    it('модуль не тянет PBXModule — источник резюме только кэш и снапшоты', () => {
        expect(
            importsDeep(AiAnalyticsBriefModule).map(module => module.name),
        ).not.toContain('PBXModule');
        expect(
            metadataList(AiAnalyticsBriefModule, 'imports').map(
                module => module.name,
            ),
        ).not.toContain('PBXModule');
    });
});
