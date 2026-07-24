import { Module } from '@nestjs/common';
import { AiRagCoreModule } from '@lib/ai-rag';
import { CallTypeRegistryService } from './services/call-type-registry.service';

/**
 * Реестр типов звонков: встроенные типы конфига смарта + переопределения/
 * дополнения из JSON-документов базы знаний kind='call-type-registry'
 * (общий слой + клиентский слой домена). См. CallTypeRegistryService.
 *
 * Импортируется модулями конвейера (call-report) и Agent API (agent-gate);
 * при появлении отдела сервиса — переиспользуется со своим kind'ом.
 */
@Module({
    // Ядро без контроллеров: /ai-rag/* роуты не протекают в приложения,
    // которым нужен только реестр (например, bitrix-app-client).
    imports: [AiRagCoreModule],
    providers: [CallTypeRegistryService],
    exports: [CallTypeRegistryService],
})
export class CallTypeRegistryModule {}
