import { Injectable } from '@nestjs/common';
import { SALES_LIST_CODES } from '@lib/portal-lib/pbx/pbx-sales-list-reader/type/sales-list-record.type';
import { PBXService } from '@/modules/pbx';
import { reportEventColumnsOfList } from '../report';
import { buildIndicatorCatalog } from './portal-view-indicators.util';
import type { PortalViewIndicator } from './portal-view.types';

/**
 * Каталог показателей портала: колонки событий из списка «KPI» (тот же
 * расчёт колонок, что у отчёта), бакеты звонков и колонки планов. Нужен
 * странице «Настройки отчёта» (что можно переименовать) и проверке ключей
 * своих названий при сохранении.
 *
 * Портал без списка KPI или без полей действия и типа — событий нет,
 * звонки и планы со звонковым фактом остаются. Ошибка чтения портала не
 * глушится: проверять ключи без каталога нельзя. Инстанс Битрикса не
 * нужен и не хранится — только модель портала на вызов.
 */
@Injectable()
export class PortalViewIndicatorsService {
    constructor(private readonly pbx: PBXService) {}

    async forDomain(domain: string): Promise<PortalViewIndicator[]> {
        const { PortalModel } = await this.pbx.init(domain);
        const kpiList = PortalModel.getListByCode(SALES_LIST_CODES.kpi);
        return buildIndicatorCatalog(
            reportEventColumnsOfList(kpiList?.bitrixfields),
        );
    }
}
