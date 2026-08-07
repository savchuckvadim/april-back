import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import {
    PortalCompanyModule,
    PortalContactModule,
    PortalDealModule,
    PortalLeadModule,
} from '@lib/portal-lib/pbx-domain';
import { PortalStoreModule } from '@lib/portal-lib/store/portal-store.module';
import { DuplicateScoreService } from './services/duplicate-score.service';
import { DuplicateSearchService } from './services/duplicate-search.service';
import { DuplicateSignalExtractService } from './services/duplicate-signal-extract.service';
import { DuplicateSourceGraphService } from './services/duplicate-source-graph.service';
import { RelatedEntitiesService } from './services/related-entities.service';
import { ResponsibleService } from './services/responsible.service';
import { SignalFieldMapService } from './services/signal-field-map.service';

/**
 * Поиск дублей CRM. Без контроллеров: модуль подключают приложения
 * (event-sales — фрейм отдела продаж, pbx-install — админка) и выставляют
 * наружу свои эндпоинты со своей авторизацией.
 *
 * AppCacheService приходит из глобального AppCacheServiceModule, который
 * приложение подключает в root-модуль.
 */
@Module({
    imports: [
        PBXModule,
        PortalStoreModule,
        PortalLeadModule,
        PortalContactModule,
        PortalCompanyModule,
        PortalDealModule,
    ],
    providers: [
        SignalFieldMapService,
        DuplicateSourceGraphService,
        DuplicateSignalExtractService,
        DuplicateSearchService,
        DuplicateScoreService,
        RelatedEntitiesService,
        ResponsibleService,
    ],
    exports: [
        SignalFieldMapService,
        DuplicateSourceGraphService,
        DuplicateSignalExtractService,
        DuplicateSearchService,
        DuplicateScoreService,
        RelatedEntitiesService,
        ResponsibleService,
    ],
})
export class PbxDuplicateModule {}
