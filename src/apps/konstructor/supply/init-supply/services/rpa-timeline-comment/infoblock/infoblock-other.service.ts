import { Injectable } from '@nestjs/common';

import { InitSupplyDto } from '../../../dto/init-supply.dto';
import { ContractSpecificationCodeEnum } from '@/apps/konstructor/document-generate/dto/specification/specification.dto';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from '../lib/rpa-comment-helper.service';

@Injectable()
export class InfoblockOtherService {
    getInfoblockOtherComment(dto: InitSupplyDto): string {
        const specificationServices = dto.contractSpecificationState.items.find(
            item => item.code === ContractSpecificationCodeEnum.SERVICES,
        );
        const services = specificationServices?.value as string;
        if (services) {
            const servicesList = services
                .split('\n')
                .map(item => item.trim())
                .filter(item => item !== '');
            const servicesComment = RpaCommentHelper.getHeaderWithIcon(
                RpaIconEnum.INFOBLOCK,
                'Другие сервисы: ',
            );
            const servicesListComment = RpaCommentHelper.getList(servicesList);
            return `${servicesComment} ${servicesListComment}`;
        }
        return '';
    }
}
