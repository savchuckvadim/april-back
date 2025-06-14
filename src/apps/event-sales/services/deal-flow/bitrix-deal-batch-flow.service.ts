import { Injectable } from '@nestjs/common';

@Injectable()
export class BitrixDealBatchFlowService {
    getBatchCommand(
        fieldsData: Record<string, any>,
        method: 'update' | 'add',
        dealId: number | null
    ): string {
        const currentMethod = `crm.deal.${method}`;
        const data: Record<string, string> = { FIELDS: JSON.stringify(fieldsData) };
        if (dealId) {
            data['ID'] = dealId.toString();
        }

        return `${currentMethod}?${new URLSearchParams(data).toString()}`;
    }

    getFullBatchCommand(
        data: Record<string, any>,
        method: 'update' | 'add',
        dealId: number | null
    ): string {
        const currentMethod = `crm.deal.${method}`;
        const params: Record<string, string> = {};

        Object.entries(data).forEach(([key, value]) => {
            params[key] = typeof value === 'string' ? value : JSON.stringify(value);
        });

        if (dealId) {
            params['ID'] = dealId.toString();
        }

        return `${currentMethod}?${new URLSearchParams(params).toString()}`;
    }

    cleanBatchCommands(batchCommands: Record<string, any>, portalDealData: any): {
        reportDeals: string[];
        planDeals: string[];
        unplannedPresDeals: string[];
        newPresDeal: string | null;
        groupped: any[];
        resultGroupped: any[];
    } {
        const reportDeals: string[] = [];
        const planDeals: string[] = [];
        const unplannedPresDeals: string[] = [];
        let newPresDeal: string | null = null;
        const groupped: any[] = [];
        const resultGroupped: any[] = [];

        // TODO: Implement actual batch command cleaning logic

        return {
            reportDeals,
            planDeals,
            unplannedPresDeals,
            newPresDeal,
            groupped,
            resultGroupped
        };
    }
}
