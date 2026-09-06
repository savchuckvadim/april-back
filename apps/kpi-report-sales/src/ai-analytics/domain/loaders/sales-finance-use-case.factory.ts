import { Injectable } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { PBXService } from '@/modules/pbx';
import {
    ClosedSalesUseCase,
    HotClientsUseCase,
    SalesFinanceCacheService,
} from '../../../sales-finance';

export interface SalesFinanceUseCases {
    closed: ClosedSalesUseCase;
    hot: HotClientsUseCase;
}

/**
 * Фабрика use-case'ов sales-finance для AI-аналитики. Кэш sales-finance
 * создаётся вручную поверх глобального AppCache (прецедент —
 * share-link-snapshot.service.ts): SalesFinanceModule несёт контроллер и
 * импортировать его в AiAnalyticsModule нельзя (app-api-surface, DI-тест
 * модуля). Так закрытые месяцы делят кэш с вкладкой «Финансы» — числа
 * совпадают на тех же фильтрах (приёмка FR-40).
 *
 * Use-case'ы non-injectable и держат только PBXService — bitrix берётся
 * per-domain внутри execute (правило CLAUDE.md про race condition).
 */
@Injectable()
export class SalesFinanceUseCaseFactory {
    constructor(
        private readonly pbx: PBXService,
        private readonly appCache: AppCacheService,
    ) {}

    create(): SalesFinanceUseCases {
        const cache = new SalesFinanceCacheService(this.appCache);
        return {
            closed: new ClosedSalesUseCase(this.pbx, cache),
            hot: new HotClientsUseCase(this.pbx, cache),
        };
    }
}
