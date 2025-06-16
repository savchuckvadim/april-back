import { APIOnlineAdminClient } from "@/clients/online/client/admin/api-online-admin.client";
import { APIOnlineClient } from "../../../../clients/online";
import { Injectable } from "@nestjs/common";    
import { UpdatePortalDto } from "./dto/update-portal.dto";


@Injectable()
export class PortalOuterService {
    constructor(
        private readonly apiOnlineClient: APIOnlineClient,
        private readonly apiOnlineAdminClient: APIOnlineAdminClient,
    ) { }

    async getByDomain(domain: string): Promise<void> {
        const response = await this.apiOnlineClient.request('post', 'getportal', { domain }, 'portal');
        if (response.resultCode === 0) {
            const portal = response.data;
            return portal;
        }
        throw new Error(response.message);
    }
    async setOrUpdate(dto: UpdatePortalDto): Promise<void> {
        const response = await this.apiOnlineAdminClient.request('post', 'update/portal', dto, 'portal');
        if (response.resultCode === 0) {
            return;
        }
        throw new Error(response.message);
    }
}
