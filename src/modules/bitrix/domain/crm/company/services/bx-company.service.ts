import { Injectable } from "@nestjs/common";
import { BxCompanyRepository } from "../repository/bx-company.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXCompany } from "../interface/bx-company.interface";
import { IBXField } from "../../fields/bx-field.interface";


export class BxCompanyService {
    private repo: BxCompanyRepository

    clone(api: BitrixBaseApi): BxCompanyService {
        const instance = new BxCompanyService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxCompanyRepository(api);
    }

    get(companyId: number) {
        return this.repo.get(companyId);
    }

    getList(filter: Partial<IBXCompany>, select?: string[]) {
        return this.repo.getList(filter, select);
    }

    set(data: Partial<IBXCompany>) {
        return this.repo.set(data);
    }

    update(companyId: number | string, data: Partial<IBXCompany>) {
        return this.repo.update(companyId, data);
    }

    getFieldsList(filter: { [key: string]: any }, select?: string[]) {
        return this.repo.getFieldList(filter, select);
    }

    getField(id: number | string) {
        return this.repo.getField(id);
    }
    addField(fields: Partial<IBXField>) {
        return this.repo.setField(fields);
    }
}
