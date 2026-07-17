import { IContact } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { CrmEntityBaseDto } from './crm-entity-base.dto';

/** Контакт, как его отдавал Laravel BtxContactResource. */
export class ContactDto extends CrmEntityBaseDto implements IContact {}
