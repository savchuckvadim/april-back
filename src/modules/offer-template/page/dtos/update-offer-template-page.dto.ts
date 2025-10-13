import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplatePageRequestDto } from './create-offer-template-page.dto';

export class UpdateOfferTemplatePageRequestDto extends PartialType(
    CreateOfferTemplatePageRequestDto,
) {}



