import { Injectable } from "@nestjs/common";
import { BitrixService, IBXCompany } from "@/modules/bitrix";
import { BxCompanyData } from "../bx-data/bx-company-data";
import { BitrixEntityType } from "../use-cases/create-deal.use-case";


export class BxCompanyService {
    
    constructor(
        private readonly bitrix: BitrixService
    ) { }
 
  
    public async searchCompany(dealId: number, inn: string): Promise<IBXCompany[] | null> {
        console.log('dealId', dealId)
        const innFieldId = BxCompanyData.inn.bitrixId
        const response = await this.bitrix.company.getList({
            [`%${innFieldId}`]: inn

        },
            ["ID", "TITLE"]
        )
        const companies = response.result;
      
        if (companies.length > 0) {
            const comment = this.getComment(companies)
            await this.setTimelineComment(dealId, comment)
        }
        return companies;
    }
    protected getComment(companies: IBXCompany[]) {
        let info = '';
        companies.forEach((company) => {
            if (company.TITLE) {
                if (!info) info = "🏢[B]" + "  Найденные компании  " + "[/B] \n"
                const companyLink = `🔹 [URL=https://alfacentr.bitrix24.ru/crm/company/details/${company.ID}/]${company.TITLE}[/URL]`
                info += companyLink + " \n"
            }
        })
      
        return info
    }
    protected async setTimelineComment(dealId: number, comment: string) {
        await this.bitrix.timeline.addTimelineComment({
            ENTITY_TYPE: BitrixEntityType.DEAL,
            ENTITY_ID: dealId,
            COMMENT: comment,
            AUTHOR_ID: '502'
        })
    }
}