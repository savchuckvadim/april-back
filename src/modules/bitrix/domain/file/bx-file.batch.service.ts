import { Injectable } from '@nestjs/common';
import { BxFileRepository } from './bx-file.repository';
import axios from 'axios';
import { BitrixBaseApi } from '../../core';

@Injectable()
export class BxFileBatchService {
    private repo: BxFileRepository;
    clone(api: BitrixBaseApi): BxFileBatchService {
        const instance = new BxFileBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxFileRepository(api);
    }
    get(cmdCode: string, id: number | string) {
        return this.repo.getBtch(cmdCode, id);
    }

}
