import { PartialType } from '@nestjs/swagger';
import { CreateTemplateBaseDto } from './create-template-base.dto';

/**
 * Тело запроса на частичное обновление шаблона. Все поля опциональны
 * (наследуются от {@link CreateTemplateBaseDto} через `PartialType`).
 */
export class UpdateTemplateBaseDto extends PartialType(CreateTemplateBaseDto) {}
