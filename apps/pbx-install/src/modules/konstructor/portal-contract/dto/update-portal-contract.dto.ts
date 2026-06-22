import { PartialType } from '@nestjs/swagger';
import { CreatePortalContractDto } from './create-portal-contract.dto';

/**
 * Тело запроса на частичное обновление договора портала. Все поля опциональны
 * (наследуются от {@link CreatePortalContractDto} через `PartialType`).
 */
export class UpdatePortalContractDto extends PartialType(
    CreatePortalContractDto,
) {}
