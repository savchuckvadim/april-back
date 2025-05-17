import { Injectable } from "@nestjs/common";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BitrixApiFactoryService } from "src/modules/bitrix/core/queue/bitrix-api.factory.service";
import { PortalService } from "src/modules/portal/portal.service";
import { PortalModel } from "src/modules/portal/services/portal.model";
import { BxActivityDto } from "../dto/bx-activity/bx-activity.dto";
import { BxActivityRepository } from "src/modules/bitrix/domain/activity/bx-activity.repository";
import { BitrixOwnerTypeId } from "src/modules/bitrix/domain/enums/bitrix-constants.enum";
import { BXActivityFile, IBXActivity } from "src/modules/bitrix/domain/activity/interfaces/bx-activity.interface";
import { BxFileRepository } from "src/modules/bitrix/domain/file/bx-file.repository";
import { IBXFile } from "src/modules/bitrix/domain/file/bx-file.interface";


export type ResultActivityFile = {
    activityId: string | number
    id: string | number
    name: string
    url: string
    duration: string
    isPlaying: string
}
@Injectable()
export class EventSalesActivityUseCase {
    private bitrixApi: BitrixBaseApi
    private portalModel: PortalModel;
    constructor(
        private readonly portalService: PortalService,
        private readonly bxFactory: BitrixApiFactoryService
    ) { }

    async init(domain: string) {
        this.portalModel = await this.portalService.getModelByDomain(domain);
        const portal = this.portalModel.getPortal();
        this.bitrixApi = this.bxFactory.create(portal)
    }

    async getActivitiesByLeadId(dto: BxActivityDto) {
        const activityRepo = new BxActivityRepository(this.bitrixApi);
        const fileRepo = new BxFileRepository(this.bitrixApi);

        const response = await activityRepo.getList({
            OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
            OWNER_ID: dto.leadId
        });

        response.result.map(act => {
            act.FILES?.map(file => {
                const cmdCode = `${act.ID}`
                fileRepo.getBtch(
                    cmdCode,
                    file.id
                )
            })
        })


        const responses = await this.bitrixApi.callBatchWithConcurrency(3);
        const resultFiles = [] as ResultActivityFile[]
        responses.forEach(fileResponse => {
            for (const activityId in fileResponse.result) {
                const file = fileResponse.result[activityId] as IBXFile
                const activity = response.result.find(act => act.ID == activityId)
                resultFiles.push({
                    id: file.ID,
                    activityId: response.result.find((act: IBXActivity) => {
                        return act.FILES?.some(f => f.id == file.ID)
                    })?.ID || 0,
                    duration: '',
                    isPlaying: '',
                    name: activity?.SUBJECT || file.NAME,
                    url: file.DOWNLOAD_URL
                })
            }
        })
        return resultFiles
    }

}