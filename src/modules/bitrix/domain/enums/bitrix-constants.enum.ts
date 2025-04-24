import { Logger } from '@nestjs/common';

export enum BitrixOwnerTypeId {
  COMPANY = 4,
  DEAL = 2,
  CONTACT = 3,
  LEAD = 1
}

export enum BitrixActivityTypeId {
  CALL = 1,
  MEETING = 2,
  EMAIL = 3,
}

const logger = new Logger('BitrixConstants');

