import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { LlmGatewayModule } from '@lib/llm-gateway';
import { SupportDeskModule } from '../desk/support-desk.module';
import { SupportMonitorModule } from '../monitor/support-monitor.module';
import { SupportAssistantService } from './application/support-assistant.service';
import { SupportDraftStore } from './infrastructure/support-draft.store';

/**
 * ИИ-помощник поддержки — ТОЛЬКО сервисы (ai/rules/app-api-surface.md).
 * Входы — Telegram-бот и Support API — в приложении bot. Провайдер модели
 * — шлюз LLM (VibeCode портала линии, запасной — настройкой).
 */
@Module({
    imports: [
        RedisModule,
        LlmGatewayModule,
        SupportDeskModule,
        SupportMonitorModule,
    ],
    providers: [SupportDraftStore, SupportAssistantService],
    exports: [SupportAssistantService, SupportDraftStore],
})
export class SupportAssistantModule {}
