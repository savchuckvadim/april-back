import { BadRequestException, Injectable } from '@nestjs/common';
import { UpdateAddressRequestDto } from '../dto/request.dto';
import { RequisiteUpdateService } from '../services/requisite-update.service';
import { ErrorMessage } from '../enums/error-message.enum';

@Injectable()
export class UpdateAddressUseCase {
    constructor(
        private readonly requisiteUpdateService: RequisiteUpdateService,
    ) {}

    async execute(dto: UpdateAddressRequestDto): Promise<boolean> {
        const { company_id, domain, address, bx_id, rq_id } = dto;

        // Преобразуем company_id в число, если пришла строка
        const companyIdNumber =
            typeof company_id === 'string'
                ? parseInt(company_id, 10)
                : Number(company_id);

        if (!companyIdNumber || !domain) {
            throw new BadRequestException(ErrorMessage.NOT_FULL_DATA);
        }

        if (!address) {
            throw new BadRequestException('Address is required');
        }

        // Определяем rq_id из rq_id или bx_id (как в оригинале data.get("rq_id"))
        // В оригинале rq_id берется из data, а в payload может быть bx_id
        // В store_rq: rq_id = data.get("bx_id")
        // bx_id может прийти как строка, нужно преобразовать в число
        const rqId = rq_id || bx_id;

        if (!rqId && rqId !== 0) {
            throw new BadRequestException('rq_id or bx_id is required');
        }

        // Преобразуем в число, если пришла строка
        const rqIdNumber =
            typeof rqId === 'string' ? parseInt(rqId, 10) : Number(rqId);

        if (isNaN(rqIdNumber)) {
            throw new BadRequestException(
                'rq_id or bx_id must be a valid number',
            );
        }

        return await this.requisiteUpdateService.updateAddress(
            address,
            rqIdNumber,
            companyIdNumber,
            domain,
        );
    }
}
