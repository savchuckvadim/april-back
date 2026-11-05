import { Injectable } from '@nestjs/common';
import { InitSupplyDto } from '../../../dto/init-supply.dto';
import { ContractSpecificationCodeEnum } from '@app/konstructor/document-generate/dto/specification/specification.dto';
import { readLtPaidPackets } from '@app/konstructor/document-generate/lib/specification-lt.util';
import {
    RpaCommentHelper,
    RpaIconEnum,
} from '../lib/rpa-comment-helper.service';

const servicesOf = (value: unknown): string[] =>
    (typeof value === 'string' ? value : '')
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);

/**
 * Legal Tech в комментарии заявки: бесплатная часть комплекта и каждый
 * платный пакет отдельной строкой со своим составом.
 */
@Injectable()
export class InfoblockLtService {
    getLtComment(dto: InitSupplyDto): string {
        return this.getFreeLt(dto) + this.getPaidLt(dto);
    }

    private getFreeLt(dto: InitSupplyDto): string {
        const items = dto.contractSpecificationState.items;
        const packet = items.find(
            item => item.code === ContractSpecificationCodeEnum.LT_FREE,
        );
        const name = typeof packet?.value === 'string' ? packet.value.trim() : '';
        if (!name) return '';
        const services = servicesOf(
            items.find(
                item =>
                    item.code === ContractSpecificationCodeEnum.LT_FREE_SERVICES,
            )?.value,
        );
        const header = RpaCommentHelper.getHeaderWithIcon(
            RpaIconEnum.INFOBLOCK,
            'Бесплатный LegalTech: ',
        );
        const list = RpaCommentHelper.getListWithBold([
            { head: name, value: RpaCommentHelper.getList(services) },
        ]);
        return `${header} ${list}`;
    }

    private getPaidLt(dto: InitSupplyDto): string {
        const packets = readLtPaidPackets(dto.contractSpecificationState.items);
        if (!packets.length) return '';
        const header = RpaCommentHelper.getHeaderWithIcon(
            RpaIconEnum.INFOBLOCK,
            'Платный LegalTech: ',
        );
        const list = RpaCommentHelper.getListWithBold(
            packets.map(packet => ({
                head: packet.name,
                value: RpaCommentHelper.getList(packet.services),
            })),
        );
        return `${header} ${list}`;
    }
}
