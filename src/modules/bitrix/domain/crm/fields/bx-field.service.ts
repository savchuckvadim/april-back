import { BxFieldRepository } from "./bx-field.repository";
import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";


export class BxFieldService {
    private repo: BxFieldRepository;

    clone(api: BitrixBaseApi): BxFieldService {
        const instance = new BxFieldService();
        instance.init(api);
        return instance;
    }

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