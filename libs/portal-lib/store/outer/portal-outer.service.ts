import { APIOnlineAdminClient } from '@lib/online/client/admin/api-online-admin.client';
import { APIOnlineClient } from '@lib/online';
import { Injectable } from '@nestjs/common';
import { PortalOnlineCacheService } from '../portal-online-cache.service';
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
        private readonly portalCache: PortalOnlineCacheService,
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

    /**
     * Запись кредов в Laravel (он шифрует их своим APP_KEY). После успеха
     * сбрасывает слепок `portal_${domain}`: иначе бэки ещё до 10 ч ходят
     * в Битрикс со старым ключом (инцидент gsirk 2026-09-28).
     */
    async setOrUpdate(dto: UpdatePortalOuterDto): Promise<void> {
        const response = (await this.apiOnlineAdminClient.request(
            'post',
            'update/portal',
            dto,
            'portal',
        )) as ApiResponse;
        if (response.resultCode === 0) {
            await this.portalCache.invalidate(dto.domain);
            return;
        }
        throw new Error(response.message);
    }
}
