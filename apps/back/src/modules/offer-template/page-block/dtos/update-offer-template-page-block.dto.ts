import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplatePageBlockDto } from './create-offer-template-page-block.dto';

export class UpdateOfferTemplatePageBlockDto extends PartialType(
    CreateOfferTemplatePageBlockDto,
) {}
