import { PartialType } from '@nestjs/swagger';
import { CreateFieldDto } from './create-field.dto';

/**
 * Тело запроса на частичное обновление поля. Все поля опциональны
 * (наследуются от {@link CreateFieldDto} через `PartialType`).
 */
export class UpdateFieldDto extends PartialType(CreateFieldDto) {}
