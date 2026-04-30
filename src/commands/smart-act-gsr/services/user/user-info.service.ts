import { PBXService } from '@/modules/pbx';
import { Injectable } from '@nestjs/common';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

type UserInfo = {
    id: string;
    name: string;
};

@Injectable()
export class UserInfoService {
    constructor(private readonly pbx: PBXService) {}

    async getUserNamesMap(
        domain: string,
        userIds: readonly string[],
    ): Promise<Map<string, UserInfo>> {
        const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
        const map = new Map<string, UserInfo>();
        if (uniqueIds.length === 0) return map;

        const { bitrix } = await this.pbx.init(domain);
        this.enqueueUsersBatch(bitrix, uniqueIds);

        const batchResult = await bitrix.api.callBatchAsync();
        const usersRaw = this.extractBatchResults(batchResult) as Array<
            | Array<{
                  ID?: number | string;
                  NAME?: string;
                  LAST_NAME?: string;
              }>
            | undefined
        >;

        for (const userResponse of usersRaw) {
            const user = Array.isArray(userResponse)
                ? userResponse[0]
                : undefined;
            const id = String(user?.ID ?? '');
            if (!id) continue;

            const parts = [
                String(user?.NAME ?? '').trim(),
                String(user?.LAST_NAME ?? '').trim(),
            ].filter(Boolean);
            const fullName = parts.join(' ').trim() || `ID ${id}`;

            map.set(id, {
                id,
                name: fullName,
            });
        }

        return map;
    }

    private enqueueUsersBatch(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        userIds: readonly string[],
    ): void {
        for (const userId of userIds) {
            void bitrix.batch.user.get(`user_${userId}`, { ID: userId }, [
                'ID',
                'NAME',
                'LAST_NAME',
                'SECOND_NAME',
            ]);
        }
    }

    private extractBatchResults(
        batchResult: IBitrixBatchResponseResult[],
    ): unknown[] {
        const results: unknown[] = [];
        for (const chunk of batchResult) {
            const rows: unknown[] = chunk?.result
                ? Object.values(chunk.result as Record<string, unknown>)
                : [];
            results.push(...rows);
        }
        return results;
    }
}
