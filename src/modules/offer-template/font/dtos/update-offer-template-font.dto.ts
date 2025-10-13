import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplateFontDto } from './create-offer-template-font.dto';

export class UpdateOfferTemplateFontDto extends PartialType(
    CreateOfferTemplateFontDto,
) {}
