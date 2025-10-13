import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplatePortalDto } from './create-offer-template-portal.dto';

export class UpdateOfferTemplatePortalDto extends PartialType(
    CreateOfferTemplatePortalDto,
) {}
