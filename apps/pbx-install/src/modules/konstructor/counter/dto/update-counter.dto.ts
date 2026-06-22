import { PartialType } from '@nestjs/swagger';
import { CreateCounterDto } from './create-counter.dto';

/**
 * Тело запроса на частичное обновление счётчика. Все поля опциональны
 * (наследуются от {@link CreateCounterDto} через `PartialType`).
 */
export class UpdateCounterDto extends PartialType(CreateCounterDto) {}
