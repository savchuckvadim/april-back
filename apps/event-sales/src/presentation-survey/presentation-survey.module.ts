import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx/pbx.module';
import { RedisModule } from '@lib/core/redis/redis.module';
import { PresentationSurveyController } from './controllers/presentation-survey.controller';
import { PresentationSurveyEndpointService } from './services/presentation-survey-endpoint.service';
import { SurveyRendezvousStore } from './services/survey-rendezvous.store';

/**
 * Ручка легаси-опросника после презентации (`POST
 * /event-sales/presentation-survey`) — рядом с event-report, но вне его
 * flow: старый React-фронт шлёт хвост/«5К» отдельным запросом, hook не
 * участвует. Redis — только дедуп operationId (24ч), сама запись
 * идемпотентна (перезапись).
 */
@Module({
    imports: [PBXModule, RedisModule],
    controllers: [PresentationSurveyController],
    providers: [PresentationSurveyEndpointService, SurveyRendezvousStore],
})
export class PresentationSurveyModule {}
