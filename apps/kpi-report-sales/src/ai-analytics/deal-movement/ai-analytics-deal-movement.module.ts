import { Module } from '@nestjs/common';
import { PortalSessionModule } from '@lib/auth';
import { BxDepartmentModule } from '@lib/bx-department';
import { AiModule } from '@lib/call-lib';
import { AiAnalyticsCoreModule } from '../core/ai-analytics-core.module';
import { DealMovementAccessService } from './deal-movement-access.service';
import { DealMovementDealsUseCase } from './deal-movement-deals.use-case';
import { DealMovementNamesReader } from './deal-movement-names.reader';
import { DealMovementOverviewUseCase } from './deal-movement-overview.use-case';
import { DealMovementPeriodLoader } from './deal-movement-period.loader';
import { DealMovementSnapshotsReader } from './deal-movement-snapshots.reader';
import { DealMovementVitrinaController } from './deal-movement-vitrina.controller';

/**
 * Срез «Движение сделок» витрины AI (20.11.2026): ручки
 * `POST ai-analytics/deal-movement/overview` и `.../deals` под сессией
 * портала. Поверхность API приложения растёт ровно на них
 * (ai/rules/app-api-surface.md); в админку срез не подключается.
 *
 * Без Битрикса: ночные снимки — AiModule (ais), звонки периода, периметр,
 * настройки и кэш — ядро (`AiAnalyticsCoreModule`), имена менеджеров —
 * структура отделов (`BxDepartmentModule`, кэш). PBXModule не нужен.
 */
@Module({
    imports: [
        AiModule,
        AiAnalyticsCoreModule,
        BxDepartmentModule,
        PortalSessionModule,
    ],
    controllers: [DealMovementVitrinaController],
    providers: [
        DealMovementAccessService,
        DealMovementSnapshotsReader,
        DealMovementPeriodLoader,
        DealMovementNamesReader,
        DealMovementOverviewUseCase,
        DealMovementDealsUseCase,
    ],
})
export class AiAnalyticsDealMovementModule {}
