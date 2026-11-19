import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { CallPageLeadService } from './call-page-lead.service';
import { CallPageLinkService } from './call-page-link.service';

/**
 * Ссылки-пропуска на страницу разбора звонка и личные ключи руководителя к
 * ней — только сервисы, без контроллеров (правило app-api-surface).
 * Подключают event-sales (ссылка в карточке разбора) и kpi-report-sales
 * (страница звонка и раздел «Разборы звонков»).
 */
@Module({
    imports: [ConfigModule, AiModule],
    providers: [CallPageLinkService, CallPageLeadService],
    exports: [CallPageLinkService, CallPageLeadService],
})
export class CallPageLinkModule {}
