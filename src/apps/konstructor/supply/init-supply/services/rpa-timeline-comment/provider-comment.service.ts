import { ProviderService } from '@/modules/portal-konstructor/provider';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from './lib/rpa-comment-helper.service';
import { Injectable } from '@nestjs/common';
import { IconHelper } from './lib/icon-helper.service';

@Injectable()
export class ProviderCommentService {
    constructor(private readonly providerService: ProviderService) {}

    public async getProviderComment(dto: InitSupplyDto) {
        const provider = await this.providerService.findById(dto.providerId);
        if (!provider) {
            return '';
        }
        return `
        ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.PROVIDER, 'Поставщик: ')}
        ${RpaCommentHelper.getList([provider.shortname])}
        `;
    }
}
