import { BxFieldRepository } from "./bx-field.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { Injectable } from "@nestjs/common";

@Injectable()
export class BxFieldService {
    private repo: BxFieldRepository;
    constructor(
    ) { }

    init(api: BitrixBaseApi) {
        this.repo = new BxFieldRepository(api);
    }
    async getUserFields() {
        return this.repo.getUserFields();
    }
    async getUserFieldsEnumeration() {
        return this.repo.getUserFieldsEnumeration();
    }
}