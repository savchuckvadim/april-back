// domain/entities/activity.entity.ts
import { CreateBitrixActivityDto } from '../dtos/create-activity.dto';
import { BitrixOwnerTypeId, BitrixActivityTypeId } from '../../enums/bitrix-constants.enum';
import { Logger } from '@nestjs/common';

export class BitrixActivityEntity {
  private static readonly logger = new Logger(BitrixActivityEntity.name);

  static fromDto(dto: CreateBitrixActivityDto) {
    // this.logger.log(`Creating activity entity from DTO: ${JSON.stringify(dto)}`);
    const responsibleId = dto.responsible.split('_')[1];
    // this.logger.log(`Responsible ID: ${responsibleId}`);

    const entity = {
      OWNER_TYPE_ID: BitrixOwnerTypeId.COMPANY,
      OWNER_ID: dto.companyId,
      TYPE_ID: BitrixActivityTypeId.CALL,
      SUBJECT: dto.title,
      RESPONSIBLE_ID: responsibleId,
      START_TIME:  dto.date, //new Date().toISOString(),
      END_TIME: dto.date,
      COMMUNICATIONS: [
        {
          VALUE: 'Компания:',
          ENTITY_ID: dto.companyId,
          ENTITY_TYPE_ID: BitrixOwnerTypeId.COMPANY,
          TYPE_ID: BitrixActivityTypeId.CALL,
        },
      ],
    };

    // this.logger.log(`Created activity entity: ${JSON.stringify(entity)}`);
    return entity;
  }
}
