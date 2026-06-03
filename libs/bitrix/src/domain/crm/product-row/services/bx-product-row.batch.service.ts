import { BxProductRowRepository } from '../repository/bx-product-row.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXProductRow } from '../interface/bx-product-row.interface';
import { ListProductRowDto } from '../dto/list-product-row.sto';

export class BxProductRowBatchService {
    private repo: BxProductRowRepository;
    constructor() {}

    init(api: BitrixBaseApi) {
        this.repo = new BxProductRowRepository(api);
    }

    set(cmdCode: string, data: IBXProductRow) {
        return this.repo.setBtch(cmdCode, data);
    }
    list(cmdCode: string, data: ListProductRowDto) {
        return this.repo.listBtch(cmdCode, data);
    }
}
