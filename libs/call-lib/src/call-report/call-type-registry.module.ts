import { Module } from '@nestjs/common';
import { AiRagModule } from '@lib/ai-rag';
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
    imports: [AiRagModule],
    providers: [CallTypeRegistryService],
    exports: [CallTypeRegistryService],
})
export class CallTypeRegistryModule {}
