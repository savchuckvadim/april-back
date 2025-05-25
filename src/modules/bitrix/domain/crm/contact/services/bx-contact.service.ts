import { Injectable } from "@nestjs/common";
import { BxContactRepository } from "../repository/bx-contact.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { IBXContact } from "../interface/bx-contact.interface";

@Injectable()
export class BxContactService {
    private repo: BxContactRepository
    constructor() { }

    init(api: BitrixBaseApi) {
        this.repo = new BxContactRepository(api);
    }

    get(contactId: number) {
        return this.repo.get(contactId);
    }

    getList(filter: Partial<IBXContact>, select?: string[]) {
        return this.repo.getList(filter, select);
    }

    set(data: { [key: string]: any }) {
        return this.repo.set(data);
    }

    update(contactId: number | string, data: { [key: string]: any }) {
        return this.repo.update(contactId, data);
    }

    getFieldsList(filter: { [key: string]: any }, select?: string[]) {
        return this.repo.getFieldList(filter, select);
    }

    getField(id: number | string) {
        return this.repo.getField(id);
    }
} 