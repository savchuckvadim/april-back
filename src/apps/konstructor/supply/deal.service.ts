import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class DealService {
    async initDeal(data: any, portal: any): Promise<any> {
        const bxDeal = this.getBxDeal(data.auth.domain, portal.accessKey);
        const bxRpa = this.getBxRpa(data.auth.domain, portal.accessKey);

        const rpa = await bxRpa.getRpa(
            data.document_id.type_id,
            data.document_id.rpa_id,
        );
        const pRpaSupple = this.getRpaByCode(portal, 'supply');

        const dealFields = this.collectDealFields(pRpaSupple, rpa);
        const initDealFields = this.transformRpaFieldsToDealFields(
            portal,
            dealFields,
        );

        const dealCategoryId = this.getDealCategoryByCode(
            portal,
            'service_base',
        );
        const rpaCrmBaseDeal = initDealFields[`UF_CRM_RPA_CRM_BASE_DEAL`];

        const fieldFile = await this.prepareFieldFile(rpa);
        const baseDealFieldsValue =
            await bxDeal.getDealFieldsValue(rpaCrmBaseDeal);

        Object.assign(initDealFields, {
            COMPANY_ID: rpa.RPA_CRM_COMPANY,
            CONTACT_IDS: rpa.RPA_CRM_CONTACTS,
            UF_CRM_RPA_ARM_COMPLECT_ID: rpa.RPA_ARM_COMPLECT_ID,
            UF_CRM_RPA_ARM_CLIENT_ID: rpa.RPA_ARM_CLIENT_ID,
            ASSIGNED_BY_ID: rpa.MANAGER_OS,
            UF_CRM_MANAGER_EDU: rpa.MANAGER_EDU,
            ...baseDealFieldsValue,
        });

        const stageCode = this.calculateStageCode(rpa.CONTRACT_END);
        initDealFields['UF_CRM_CURRENT_CONTRACT'] = '';
        initDealFields['UF_CRM_CURRENT_INVOICE'] = '';
        initDealFields['UF_CRM_CURRENT_SUPPLY'] = '';

        const deal = await bxDeal.initNewElement(
            initDealFields,
            dealCategoryId.bitrixId,
            stageCode,
        );
        const dealId = deal.result[0];

        await bxDeal.updateDeal(dealId, initDealFields);
        await bxDeal.updateDeal(dealId, fieldFile);

        this.copyProductRowsFromBaseDeal(rpa.RPA_CRM_BASE_DEAL, bxDeal, dealId);
        this.updateCompanyAndContacts(portal, rpa, data.auth.domain);

        await this.addTimelineToDealAndRpa(
            bxDeal,
            bxRpa,
            data,
            dealId,
            pRpaSupple,
        );
        await this.initOrkTasks(portal, data.auth.domain, rpa, dealId);

        await this.notifyDealCreation(dealId, data.auth.domain);

        return portal;
    }

    private getBxDeal(domain: string, accessKey: string): any {
        // Simulate BxDeal service
        return {
            getDealFieldsValue: async (dealId: any) => ({}),
            initNewElement: async (
                initDealFields: any,
                dealCategoryId: number,
                stageCode: string,
            ) => ({ result: [1] }),
            updateDeal: async (dealId: number, fields: any) => {},
            getProductRows: async (baseDealId: number) => [],
            setProductRows: async (
                dealServiceId: number,
                productRows: any,
            ) => {},
        };
    }

    private getBxRpa(domain: string, accessKey: string): any {
        // Simulate BxRpa service
        return {
            getRpa: async (typeId: number, rpaId: number) => ({}),
            addTimeline: async (
                text: string,
                typeId: number,
                itemId: number,
            ) => {},
        };
    }

    private getRpaByCode(portal: any, code: string): any {
        // Simulate fetching RPA by code
        return { bitrixfields: [] };
    }

    private collectDealFields(pRpaSupple: any, rpa: any): any {
        // Simulate collecting deal fields
        return {};
    }

    private transformRpaFieldsToDealFields(portal: any, dealFields: any): any {
        // Simulate transforming RPA fields to deal fields
        return {};
    }

    private getDealCategoryByCode(portal: any, code: string): any {
        // Simulate getting deal category by code
        return { bitrixId: 1 };
    }

    private calculateStageCode(contractEnd: string): string {
        // Simulate calculating stage code
        return 'stage_code';
    }

    private async prepareFieldFile(rpa: any): Promise<any> {
        // Simulate preparing field file
        return {};
    }

    private async copyProductRowsFromBaseDeal(
        baseDealId: number,
        bxDeal: any,
        dealServiceId: number,
    ): Promise<void> {
        const productRows = await bxDeal.getProductRows(baseDealId);
        productRows.forEach(row => {
            row.OWNER_ID = dealServiceId;
        });
        await bxDeal.setProductRows(dealServiceId, productRows);
    }

    private async updateCompanyAndContacts(
        portal: any,
        rpa: any,
        domain: string,
    ): Promise<void> {
        // Simulate updating company and contacts
    }

    private async addTimelineToDealAndRpa(
        bxDeal: any,
        bxRpa: any,
        data: any,
        dealId: number,
        pRpaSupple: any,
    ): Promise<void> {
        // Simulate adding timeline to deal and RPA
    }

    private async initOrkTasks(
        portal: any,
        domain: string,
        rpa: any,
        dealServiceId: number,
    ): Promise<void> {
        // Simulate initializing ORK tasks
    }

    private async notifyDealCreation(
        dealId: number,
        domain: string,
    ): Promise<void> {
        // Simulate notifying deal creation
        console.log(`Created Deal: ${dealId}`);
    }
}
