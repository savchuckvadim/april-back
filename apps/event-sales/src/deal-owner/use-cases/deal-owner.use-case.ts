import { Injectable, NotFoundException } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    AlignDealOwnerRequestDto,
    DealOwnerAlignResultDto,
} from '../dto/deal-owner.dto';
import { DealOwnerAlignService } from '../services/deal-owner-align.service';
import { OpenCardOnceGuard } from '../../shared/open-card-once';

/**
 * Компания и контакты за ответственным сделки — при открытии своей сделки
 * в «Звонках». Доменная работа — в `DealOwnerAlignService`; здесь инстанс
 * Битрикса по домену. `this.bitrix` в поле НЕ хранится (CLAUDE.md).
 */
@Injectable()
export class DealOwnerUseCase {
    constructor(
        private readonly pbx: PBXService,
        private readonly once: OpenCardOnceGuard,
    ) {}

    /**
     * Недавно выравнивали для этого сотрудника — не повторяем; отметка
     * после успеха (в том числе когда выравнивать было нечего).
     */
    async align(
        dealId: number,
        dto: AlignDealOwnerRequestDto,
    ): Promise<DealOwnerAlignResultDto> {
        const scope = {
            action: 'deal-owner-align' as const,
            domain: dto.domain,
            dealId,
            userId: dto.userId,
        };
        if (await this.once.isRecent(scope)) {
            return {
                responsibleId: null,
                skipped: 'recent',
                companyMoved: false,
                contactsMoved: 0,
                warnings: [],
            };
        }
        const { bitrix } = await this.pbx.init(dto.domain);
        const result = await new DealOwnerAlignService(
            bitrix,
            dto.domain,
        ).align(dealId, dto.userId);
        if (!result) {
            throw new NotFoundException(`Сделка ${dealId} не найдена`);
        }
        await this.once.remember(scope);
        return result;
    }
}
