import { PartialType } from '@nestjs/mapped-types';
import { CreateOfferTemplatePageStickerDto } from './create-offer-template-page-sticker.dto';

export class UpdateOfferTemplatePageStickerDto extends PartialType(
    CreateOfferTemplatePageStickerDto,
) {}
