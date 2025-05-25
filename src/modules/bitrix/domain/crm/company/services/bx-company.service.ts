import { Injectable } from "@nestjs/common";
import { BxCompanyRepository } from "../repository/bx-company.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXCompany } from "../interface/bx-company.interface";

@Injectable()
export class BxCompanyService {
    private repo: BxCompanyRepository
    constructor() { }

    init(api: BitrixBaseApi) {
        this.repo = new BxCompanyRepository(api);
    }

    get(companyId: number) {
        return this.repo.get(companyId);
    }

    getList(filter: Partial<IBXCompany>, select?: string[]) {
        return this.repo.getList(filter, select);
    }

    set(data: { [key: string]: any }) {
        return this.repo.set(data);
    }

    update(companyId: number | string, data: { [key: string]: any }) {
        return this.repo.update(companyId, data);
    }

    getFieldsList(filter: { [key: string]: any }, select?: string[]) {
        return this.repo.getFieldList(filter, select);
    }

    getField(id: number | string) {
        return this.repo.getField(id);
    }
}
