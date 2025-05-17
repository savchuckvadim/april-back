import { PortalContextService } from "src/modules/portal/services/portal-context.service";
import { BitrixRequestApiService } from "../../core/http/bitrix-request-api.service";
import { ListRepository } from "../../domain/list/list.repository";
import { Logger, Injectable, HttpStatus, HttpException } from "@nestjs/common";
import { IField, IPBXList } from "src/modules/portal/interfaces/portal.interface";

@Injectable()
export class ListService {
    constructor(
        private readonly portalService: PortalContextService,
        private readonly bitrixService: BitrixRequestApiService
    ) { }

    async getList() {
        Logger.log('getList domain from bx api')
        Logger.log(this.bitrixService.domain)
        const repository = new ListRepository(this.bitrixService);
        return await repository.getList('sales_kpi');
    }

    async getListFields() {
        Logger.log('getListFields domain from bx api');
        Logger.log(this.bitrixService.domain);
        const repository = new ListRepository(this.bitrixService);
        const p = this.portalService.getPortal();
        const portal = this.portalService.getModel();
        const kpiPList = portal.getListByCode('sales_kpi');
        let kpiListField: IField | undefined;
        if (kpiPList) {
            kpiListField = portal.getIdByCodeFieldList((kpiPList as IPBXList), 'event_type')

            if (kpiListField) {
                const bxResult = await repository.getListField('kpi', kpiListField?.bitrixCamelId);
                // const bxResult = await repository.getList();
                return {
                    p: p.domain,
                    kpiListField: kpiListField,
                    // portalList: kpiPList?.bitrixfields,
                    bxResult
                }
            }

        }
        throw new HttpException({
            message: 'kpiListField not found',
            kpiPList: kpiPList,
            kpiListField: kpiListField
        }, HttpStatus.BAD_REQUEST);


    }
}
