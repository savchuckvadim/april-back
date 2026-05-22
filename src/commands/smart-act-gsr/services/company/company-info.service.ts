import { PBXService } from '@/modules/pbx';
import { Injectable } from '@nestjs/common';
import { IBitrixBatchResponseResult } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';

@Injectable()
export class CompanyInfoService {
    constructor(private readonly pbx: PBXService) {}

    async getCompanyTitlesMap(
        domain: string,
        companyIds: readonly string[],
    ): Promise<Map<string, string>> {
        const uniqueIds = Array.from(
            new Set(companyIds.filter(id => id && id !== '0')),
        );
        const map = new Map<string, string>();
        if (uniqueIds.length === 0) return map;

        const { bitrix } = await this.pbx.init(domain);
        this.enqueueCompanyBatch(bitrix, uniqueIds);

        const batchResult = await bitrix.api.callBatchAsync();
        const companiesRaw = this.extractBatchResults(batchResult) as Array<
            | {
                  ID?: number | string;
                  TITLE?: string;
              }
            | null
            | undefined
        >;

        for (const company of companiesRaw) {
            if (!company) continue;
            const id = String(company.ID ?? '');
            if (!id) continue;
            const title = String(company.TITLE ?? '').trim();
            map.set(id, title || `Компания ${id}`);
        }

        return map;
    }

    private enqueueCompanyBatch(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        companyIds: readonly string[],
    ): void {
        for (const companyId of companyIds) {
            void bitrix.batch.company.get(`company_${companyId}`, companyId, [
                'ID',
                'TITLE',
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
