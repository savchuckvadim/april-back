import { Module } from '@nestjs/common';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { DocumentTemplateService } from './document-template.service';
import { DocumentTemplateDiagnosticsService } from './document-template-diagnostics.service';
import { DocumentTemplateRepository } from './document-template.repository';
import { DocumentTemplatePrismaRepository } from './document-template.prisma.repository';

/**
 * Сервисный модуль подбора шаблонов документов — БЕЗ контроллеров.
 * Его импортирует konstructor, чтобы генерация могла спросить
 * «какой шаблон брать». CRUD-роуты шаблонов живут в своих модулях
 * (`contract-template`, `supply-report-template`, `invoice-template`).
 * См. ai/rules/app-api-surface.md.
 *
 * `PortalStoreModule` нужен здесь, потому что сервис инжектит
 * `PortalStoreService` для domain → portal_id. Правило про грабли:
 * `XxxAdminModule` видит только то, что экспортирует `XxxModule`, —
 * поэтому экспортируется всё, что инжектят внешние потребители: оба
 * сервиса (резолвер и диагностика — её инжектит контроллер из
 * `DocumentTemplatePublicModule`) и репозиторий.
 *
 * Диагностике `PortalStoreService` не нужен — она ходит только в
 * репозиторий; провайдер объявлен здесь, чтобы оба сервиса делили одну
 * реализацию репозитория.
 */
@Module({
    imports: [PortalStoreModule],
    providers: [
        DocumentTemplateService,
        DocumentTemplateDiagnosticsService,
        {
            provide: DocumentTemplateRepository,
            useClass: DocumentTemplatePrismaRepository,
        },
    ],
    exports: [
        DocumentTemplateService,
        DocumentTemplateDiagnosticsService,
        DocumentTemplateRepository,
    ],
})
export class DocumentTemplateModule {}
