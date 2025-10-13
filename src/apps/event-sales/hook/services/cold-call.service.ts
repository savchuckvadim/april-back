import { PBXService } from 'src/modules/pbx';
import { ColdCallQueryDto } from '../dto/cold.dto';
import { ColdCallBxEntityService } from './cold-call-bx-entity.service';

export class ColdCallService {
    private entityService: ColdCallBxEntityService;
    constructor(private readonly pbx: PBXService) {}

    async flow(dto: ColdCallQueryDto, domain: string) {
        const { bitrix, PortalModel } = await this.pbx.init(domain);
        this.entityService = new ColdCallBxEntityService(bitrix, PortalModel);

        const usersIds = this.getUsersIds(dto);
        this.entityService.flow(
            dto.name,
            dto.deadline,
            usersIds.responsible,
            usersIds.created,
        );
    }

    private getUsersIds(dto: ColdCallQueryDto) {
        const result = {
            responsible: '',
            created: '',
        };

        if (dto.created) {
            result.created = dto.created.split('_').slice(1).join('_');
        }

        if (dto.responsible) {
            result.responsible = dto.responsible.split('_').slice(1).join('_');
        }

        return result;
    }
}
