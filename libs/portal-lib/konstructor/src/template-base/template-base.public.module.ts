import { Module } from '@nestjs/common';
import { TemplateBaseModule } from './template-base.module';
import { TemplateBaseController } from './template-base.controller';

/**
 * Слой доставки шаблонов-баз (`template-base/*`) — нужен приложению
 * konstructor. Импортирует {@link TemplateBaseModule} ради сервисов и
 * регистрирует ТОЛЬКО контроллер, чтобы приложения, которым нужен лишь
 * репозиторий (event-sales тянет konstructor-агрегат транзитом ради
 * смартов), не получали эти роуты — см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [TemplateBaseModule],
    controllers: [TemplateBaseController],
})
export class TemplateBasePublicModule {}
