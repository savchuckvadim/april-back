import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    AlignDealOwnerRequestDto,
    DealOwnerAlignResultDto,
} from '../dto/deal-owner.dto';
import { DealOwnerAlignService } from '../services/deal-owner-align.service';

/**
 * Компания и контакты за ответственным сделки — при открытии своей сделки
 * в «Звонках». Доменная работа — в `DealOwnerAlignService`; здесь инстанс
 * Битрикса по домену. `this.bitrix` в поле НЕ хранится (CLAUDE.md).
 */
@Injectable()
export class DealOwnerUseCase {
    constructor(private readonly pbx: PBXService) {}

    async align(
        dealId: number,
        dto: AlignDealOwnerRequestDto,
    ): Promise<DealOwnerAlignResultDto> {
        const { bitrix } = await this.pbx.init(dto.domain);
        const result = await new DealOwnerAlignService(
            bitrix,
            dto.domain,
        ).align(dealId, dto.userId);
        if (!result) {
            throw new NotFoundException(`Сделка ${dealId} не найдена`);
        }
        return result;
    }
}
