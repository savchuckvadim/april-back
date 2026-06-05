import { APIOnlineAdminClient } from '@lib/online/client/admin/api-online-admin.client';
import { APIOnlineClient } from '@lib/online';
import { Injectable } from '@nestjs/common';
import { UpdatePortalOuterDto } from './dto/update-portal.dto';

type ApiResponse = {
    resultCode: number;
    message: string;
    data?: unknown;
};

@Injectable()
export class PortalOuterService {
    constructor(
        private readonly apiOnlineClient: APIOnlineClient,
        private readonly apiOnlineAdminClient: APIOnlineAdminClient,
    ) {}

    async getByDomain(domain: string): Promise<unknown> {
        const response = (await this.apiOnlineClient.request(
            'post',
            'getportal',
            { domain },
            'portal',
        )) as ApiResponse;
        if (response.resultCode === 0) {
            return response.data;
        }
        throw new Error(response.message);
    }

    async setOrUpdate(dto: UpdatePortalOuterDto): Promise<void> {
        const response = (await this.apiOnlineAdminClient.request(
            'post',
            'update/portal',
            dto,
            'portal',
        )) as ApiResponse;
        if (response.resultCode === 0) {
            return;
        }
        throw new Error(response.message);
    }
}
