import { BadRequestException, Injectable } from '@nestjs/common';
import { StoreRqRequestDto } from '../dto/request.dto';
import { ERQItem } from '../dto/erq-item.dto';
import {
    isNewRequisite,
    RequisiteUpdateService,
} from '../services/requisite-update.service';
import { ErrorMessage } from '../enums/error-message.enum';
import { BxRqService } from '../services/BxRqService';

@Injectable()
export class StoreRqUseCase {
    constructor(
        private readonly bxRqService: BxRqService,
        private readonly requisiteUpdateService: RequisiteUpdateService,
    ) {}

    /** Ровно одно из rq / address / bank; iswait всегда true, очередей нет. */
    async execute(dto: StoreRqRequestDto): Promise<ERQItem | boolean | number> {
        const { company_id, domain, rq, bx_id, preset_id, address, bank } = dto;
        if (rq) {
            // для нового реквизита список компании не нужен: заготовка строится по пресету
            const bxRqs = isNewRequisite(bx_id)
                ? []
                : await this.bxRqService.getRq(company_id, domain);
            return this.requisiteUpdateService.updateRequisite(
                rq,
                bx_id,
                bxRqs,
                company_id,
                domain,
                preset_id,
            );
        }
        if (address) {
            return this.requisiteUpdateService.updateAddress(
                address,
                bx_id!,
                company_id,
                domain,
            );
        }
        if (bank) {
            return this.requisiteUpdateService.updateBank(bank, bx_id!, domain);
        }

        throw new BadRequestException(ErrorMessage.NOT_FULL_DATA);
    }
}
