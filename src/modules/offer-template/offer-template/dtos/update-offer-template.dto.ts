import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplateRequestDto } from './create-offer-template.dto';

export class UpdateOfferTemplateDto extends PartialType(
    CreateOfferTemplateRequestDto,
) {}
