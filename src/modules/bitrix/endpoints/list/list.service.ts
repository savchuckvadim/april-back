import { BxListRepository } from '../../domain/list/repository/bx-list.repository';
import { Logger, Injectable, HttpStatus, HttpException } from '@nestjs/common';
import {
    IField,
    IPBXList,
} from 'src/modules/portal/interfaces/portal.interface';
import { EBxListCode } from '../../domain';

import { PBXService } from '@/modules/pbx';

@Injectable()
export class ListService {
    constructor(
        // private readonly portalService: PortalContextService,
        // private readonly bitrixService: BitrixBaseApi,
        private readonly pbx: PBXService,
    ) {}

    async getList(domain: string) {
        Logger.log('getList domain from bx api');
        const { bitrix } = await this.pbx.init(domain);
        const repository = new BxListRepository(bitrix.api);
        return await repository.getList(EBxListCode.SALES_KPI);
    }

    async getListFields(domain: string) {
        Logger.log('getListFields domain from bx api');
        const { bitrix } = await this.pbx.init(domain);
        const repository = new BxListRepository(bitrix.api);
        const {PortalModel } = await this.pbx.init(domain);
        const portal = PortalModel;
        const kpiPList = PortalModel.getListByCode('sales_kpi');
        let kpiListField: IField | undefined;
        if (kpiPList) {
            kpiListField = portal.getIdByCodeFieldList(
                kpiPList as IPBXList,
                'event_type',
            );

            if (kpiListField) {
                const bxResult = await repository.getListField(
                    EBxListCode.KPI,
                    kpiListField?.bitrixCamelId,
                );
                // const bxResult = await repository.getList();
                return {
                    p: portal.getPortal().domain,
                    kpiListField: kpiListField,
                    // portalList: kpiPList?.bitrixfields,
                    bxResult,
                };
            }
        }
        throw new HttpException(
            {
                message: 'kpiListField not found',
                kpiPList: kpiPList,
                kpiListField: kpiListField,
            },
            HttpStatus.BAD_REQUEST,
        );
    }
}
