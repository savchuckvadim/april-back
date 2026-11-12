import { Injectable } from '@nestjs/common';
import { PbxPresentationSmartService } from '@lib/portal-lib/pbx/pbx-presentation-smart';
import { PbxZprSmartService } from '@lib/portal-lib/pbx/pbx-zpr-smart';
import { ColdSmartInfos } from '../../../cold-hook-v2/services/relations/cold-relations.types';

/**
 * Смарты «Презентации» и «ЗПР» портала для перехвата клиента — тот же
 * резолв, что у холодного обзвона «с очищением». Вызывается только когда
 * перехват действительно есть: обычному отчёту эти чтения не нужны.
 * Bitrix-состояния не держит — по домену читает реестр смартов.
 */
@Injectable()
export class TakeoverSmartsResolver {
    constructor(
        private readonly presSmart: PbxPresentationSmartService,
        private readonly zprSmart: PbxZprSmartService,
    ) {}

    async resolve(domain: string): Promise<ColdSmartInfos> {
        return {
            pres: await this.presSmart.resolveInfo(domain),
            zpr: await this.zprSmart.resolveInfo(domain),
        };
    }
}
