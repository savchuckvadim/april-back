import { Injectable } from '@nestjs/common';
import { GetRqRequestDto } from '../dto/request.dto';
import { ERQDTO } from '../dto/erq-item.dto';
// import { RequisiteService } from '../services/requisite.service';
import { RequisiteMapperService } from '../services/requisite-mapper.service';
// import { PBXService } from '@/modules/pbx';
import { BxRqService } from '../services/BxRqService';

@Injectable()
export class GetRqUseCase {
    constructor(
        // private readonly requisiteService: RequisiteService,
        private readonly requisiteMapperService: RequisiteMapperService,
        // private readonly pbxService: PBXService,
        private readonly bxRqService: BxRqService,
    ) {}

    async execute(dto: GetRqRequestDto): Promise<ERQDTO> {
        const { company_id, domain } = dto;

        // iswait всегда true - убрали логику очередей
        // const bxRqs = await this.requisiteService.getRq(company_id, domain);
        const bxRqs = await this.bxRqService.getRq(company_id, domain);

        const erqDto =
            await this.requisiteMapperService.mapBxRequisitesToErqDto(
                bxRqs,
                company_id,
                domain,
            );

        // // Устанавливаем выбранный реквизит
        // вроде нет такого метода текущий реквизит устанавливается в fields сущности через фронт
        // const current = erqDto.current;
        // if (current) {
        //     await this.requisiteService.setSelectedRq(
        //         company_id,
        //         current.bx_id || -1,
        //         current.bank?.current?.id || -1,
        //         domain,
        //     );
        // }

        return erqDto;
    }
}
