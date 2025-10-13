import {
    ContractSpecificationCodeEnum,
    ContractSpecificationDto,
} from '@/apps/konstructor/document-generate/dto/specification/specification.dto';
import { Injectable } from '@nestjs/common';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from '../lib/rpa-comment-helper.service';

@Injectable()
export class InfoblockConsaltingService {
    getInfoblockConsaltingComment(
        contractSpecification: ContractSpecificationDto,
    ): string {
        const infoblockConsalting = contractSpecification.items.find(
            item => item.code === ContractSpecificationCodeEnum.PK,
        );
        const infoblockConsaltingValue = infoblockConsalting?.value as string;

        if (infoblockConsaltingValue) {
            return `
            ${RpaCommentHelper.getHeaderWithIcon(RpaIconEnum.CONSULTING, 'ПК/ГЛ: ')}
            ${RpaCommentHelper.getList([infoblockConsaltingValue])}
            `;
        }
        return '';
    }
}
