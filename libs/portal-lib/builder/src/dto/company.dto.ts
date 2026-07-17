import { ICompany } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { CrmEntityBaseDto } from './crm-entity-base.dto';

/** Компания, как её отдавал Laravel BtxCompanyResource. */
export class CompanyDto extends CrmEntityBaseDto implements ICompany {}
