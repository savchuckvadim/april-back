import { PartialType } from '@nestjs/mapped-types';
import { CreateUserSelectedTemplateDto } from './create-user-selected-template.dto';

export class UpdateUserSelectedTemplateDto extends PartialType(
    CreateUserSelectedTemplateDto,
) {}
