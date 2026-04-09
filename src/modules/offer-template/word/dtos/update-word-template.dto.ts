import { PartialType } from '@nestjs/mapped-types';
import { CreateWordTemplateBodyDto } from './create-word-template.dto';

export class UpdateWordTemplateDto extends PartialType(
    CreateWordTemplateBodyDto,
) {}
