import { Injectable } from '@nestjs/common';
import { InitSupplyBxrqService } from '../bxrq/init-supply-bxrq.service';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from './lib/rpa-comment-helper.service';
import { InitSupplyDto } from '../../dto/init-supply.dto';
import { IconHelper } from './lib/icon-helper.service';

@Injectable()
export class RqCommentService {
    constructor(private readonly rqService: InitSupplyBxrqService) {}

    public getRqComment(dto: InitSupplyDto): string {
        const { address, fullName, inn } = this.rqService.getBxrqValues(
            dto.bxrq,
            dto.clientType.code,
        );
        const list = [
            { head: 'Название: ', value: fullName },
            { head: 'ИНН: ', value: inn },
            { head: 'Адрес: ', value: address },
        ];
        return `
        ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.CLIENT, 'Покупатель: ')}
        ${RpaCommentHelper.getListWithBold(list)}
        `;
    }
}
