import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplateImageDto } from './create-offer-template-image.dto';

export class UpdateOfferTemplateImageDto extends PartialType(
    CreateOfferTemplateImageDto,
) {}
