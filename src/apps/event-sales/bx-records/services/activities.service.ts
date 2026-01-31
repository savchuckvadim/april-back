import { BitrixActivityTypeId, BitrixOwnerTypeId, BitrixService } from "@/modules/bitrix";
import { IBXActivity } from "@/modules/bitrix/domain/activity/interfaces/bx-activity.interface";

export class ActivitiesService {
    constructor(
        private readonly bitrix: BitrixService
    ) { }

    public async getActivities(
        companyId: number,
        contactIds: number[],
        leadsIds: number[],
        dealsIds: number[]
    ): Promise<IBXActivity[]>{
        const companyActivities = await this.getCompanyActivities(companyId)
        const contactsActivities = await this.getContatcsActivities(contactIds)
        const leadsActivities = await this.getLeadsActivities(leadsIds)
        const dealsActivities = await this.getDealsActivities(dealsIds)

        return [
            ...companyActivities,
            ...contactsActivities,
            ...leadsActivities,
            ...dealsActivities
        ]

    }


    private async getCompanyActivities(companyId: number): Promise<IBXActivity[]> {
        let result: IBXActivity[] = [];
        if (companyId) {

            const response = await this.bitrix.activity.getAll({
                OWNER_TYPE_ID: BitrixOwnerTypeId.COMPANY,
                OWNER_ID: companyId,
                TYPE_ID: BitrixActivityTypeId.CALL
            })
            result = response.activities
        }
        return result;
    }

    private async getContatcsActivities(contactIds: number[]): Promise<IBXActivity[]> {
        let result: IBXActivity[] = [];
        if (contactIds && contactIds.length) {
            const response = await this.bitrix.activity.getAll({
                OWNER_TYPE_ID: BitrixOwnerTypeId.CONTACT,
                OWNER_ID: contactIds,
                TYPE_ID: BitrixActivityTypeId.CALL
            })
            result = response.activities
        }
        return result;

    }
    private async getLeadsActivities(leadsIds: number[]): Promise<IBXActivity[]> {
        let result: IBXActivity[] = [];
        if (leadsIds && leadsIds.length) {
            const response = await this.bitrix.activity.getAll({
                OWNER_TYPE_ID: BitrixOwnerTypeId.LEAD,
                OWNER_ID: leadsIds,
                TYPE_ID: BitrixActivityTypeId.CALL
            })
            result = response.activities
        }
        return result;

    }

    private async getDealsActivities(dealsIds: number[]): Promise<IBXActivity[]> {
        let result: IBXActivity[] = [];
        if (dealsIds && dealsIds.length) {
            const response = await this.bitrix.activity.getAll({
                OWNER_TYPE_ID: BitrixOwnerTypeId.DEAL,
                OWNER_ID: dealsIds,
                TYPE_ID: BitrixActivityTypeId.CALL
            })
            result = response.activities
        }
        return result;

    }
}
