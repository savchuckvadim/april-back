import { Module } from '@nestjs/common';
import { DocumentTemplateModule } from './document-template.module';
import { DocumentTemplateController } from './document-template.controller';

/**
 * Слой доставки read-only роутов подбора шаблонов (`konstructor/templates/*`).
 *
 * Только контроллер: сервисы приходят из {@link DocumentTemplateModule}.
 * Разделение обязательно по ai/rules/app-api-surface.md — konstructor
 * тянут транзитом другие приложения (event-sales ради смартов), и без
 * раскола эти роуты утекли бы в их Swagger, по которому генерируется
 * фронтовый клиент.
 *
 * ГРАБЛИ, из-за которых модуль падает на старте, а не на сборке:
 * `XxxPublicModule` видит только то, что сервисный модуль ЭКСПОРТИРУЕТ.
 * Контроллер инжектит два сервиса — `DocumentTemplateService` и
 * `DocumentTemplateDiagnosticsService`, — поэтому оба добавлены в
 * `exports` у `DocumentTemplateModule`. Иначе
 * `UnknownDependenciesException` вылезет только в рантайме, обычно уже
 * при деплое.
 */
@Module({
    imports: [DocumentTemplateModule],
    controllers: [DocumentTemplateController],
})
export class DocumentTemplatePublicModule {}
