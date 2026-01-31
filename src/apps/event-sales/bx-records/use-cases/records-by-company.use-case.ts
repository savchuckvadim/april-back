import { PBXService } from "@/modules/pbx";
import { CompanyRelationsService } from "../services/company-relations.service";
import { BxRecordsByCompanyRequestDto } from "../dto/bx-records.dto";
import { ActivitiesService } from "../services/activities.service";
import { RecordsService } from "../services/records.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class RecordsByCompanyUseCase {

    constructor(
        private readonly pbx: PBXService
    ) { }



    public async getRecords(dto: BxRecordsByCompanyRequestDto) {
        const { bitrix } = await this.pbx.init(dto.domain)
        const relationsService = new CompanyRelationsService(bitrix)
        const activitiesService = new ActivitiesService(bitrix)
        const recordsService = new RecordsService(bitrix)
        const {
            contactsIds,
            dealsIds,
            leadsIds
        } = await relationsService.getRelationsIds(dto.companyId, dto.contactIds)

        const activities = await activitiesService.getActivities(dto.companyId, contactsIds, leadsIds, dealsIds)
        const records = await recordsService.getRecords(activities)
        return records
    }
}
