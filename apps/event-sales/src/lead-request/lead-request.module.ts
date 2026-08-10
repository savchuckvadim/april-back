import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { LeadRequestService } from './services/lead-request.service';
import { LeadRequestController } from './controllers/lead-request.controller';

/**
 * Карточка заявки/лида для приложения «Звонки» (интерфейс заявки: статусы,
 * стадии, «не ЦА», чёрный список, оценка лидогена, история обработки).
 * Контроллер — часть поверхности event-sales, поэтому живёт прямо в
 * приложении (правило ai/rules/app-api-surface.md о lib-модулях тут не
 * применяется — это app-модуль).
 */
@Module({
    imports: [PBXModule],
    controllers: [LeadRequestController],
    providers: [LeadRequestService],
    exports: [LeadRequestService],
})
export class LeadRequestModule {}
