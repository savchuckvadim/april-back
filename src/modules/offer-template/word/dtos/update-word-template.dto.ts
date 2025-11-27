import { PartialType } from '@nestjs/mapped-types';
import { CreateWordTemplateRequestDto } from './create-word-template.dto';

export class UpdateWordTemplateDto extends PartialType(
    CreateWordTemplateRequestDto,
) { }

