import { Injectable } from "@nestjs/common";
import { BxCompanyRepository } from "../repository/bx-company.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXCompany } from "../interface/bx-company.interface";
import { IBXField } from "../../fields/bx-field.interface";

export class BxCompanyBatchService {
    private repo: BxCompanyRepository

    clone(api: BitrixBaseApi): BxCompanyBatchService {
        const instance = new BxCompanyBatchService();
        instance.init(api);
        return instance;
    }


    init(api: BitrixBaseApi) {
        this.repo = new BxCompanyRepository(api);
    }

    get(cmdCode: string, companyId: number | string) {
        return this.repo.getBtch(cmdCode, companyId);
    }

    getList(cmdCode: string, filter: Partial<IBXCompany>, select?: string[]) {
        return this.repo.getListBtch(cmdCode, filter, select);
    }

    set(cmdCode: string, data: Partial<IBXCompany>) {
        return this.repo.setBtch(cmdCode, data);
    }

    update(cmdCode: string, companyId: number | string, data: Partial<IBXCompany>) {
        return this.repo.updateBtch(cmdCode, companyId, data);
    }

    getField(cmdCode: string, id: number | string) {
        return this.repo.getFieldBtch(cmdCode, id);
    }

    addField(cmdCode: string, fields: Partial<IBXField>) {
        return this.repo.setFieldBtch(cmdCode, fields);
    }
}
