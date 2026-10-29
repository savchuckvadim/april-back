import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EgressProxyService } from './egress-proxy.service';

/**
 * Исходящий прокси за рубеж (@lib/egress-proxy). Не глобальный: модуль
 * импортируют те, кто ходит к внешним AI-провайдерам и Telegram
 * (LlmGatewayModule, TranscriptionProviderModule, TelegramModule,
 * SupportMonitorModule). Конфиг — env EGRESS_PROXY_* приложения.
 */
@Module({
    imports: [ConfigModule],
    providers: [EgressProxyService],
    exports: [EgressProxyService],
})
export class EgressProxyModule {}
