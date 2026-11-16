import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '../ai/ai.module';
import { CallPageLinkService } from './call-page-link.service';

/**
 * Ссылки-пропуска на страницу разбора звонка — только сервис, без
 * контроллеров (правило app-api-surface). Подключают event-sales (ссылка в
 * карточке разбора) и kpi-report-sales (страница звонка).
 */
@Module({
    imports: [ConfigModule, AiModule],
    providers: [CallPageLinkService],
    exports: [CallPageLinkService],
})
export class CallPageLinkModule {}
