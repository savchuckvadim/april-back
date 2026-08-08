import { Module } from '@nestjs/common';
import { ProviderModule } from './provider.module';
import { ProviderController } from './provider.controller';

/**
 * Слой доставки публичных роутов поставщиков (`provider/*`) — нужен
 * приложению konstructor. Импортирует {@link ProviderModule} ради сервисов
 * и регистрирует ТОЛЬКО контроллер, чтобы event-sales (тянущий konstructor
 * транзитом ради смартов) не получал эти роуты в свой Swagger —
 * см. ai/rules/app-api-surface.md.
 */
@Module({
    imports: [ProviderModule],
    controllers: [ProviderController],
})
export class ProviderPublicModule {}
