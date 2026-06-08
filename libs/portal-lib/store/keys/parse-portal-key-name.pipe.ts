import { BadRequestException, PipeTransform } from '@nestjs/common';
import {
    isPortalKeyName,
    PORTAL_KEY_NAMES,
    PortalKeyName,
} from './portal-key.const';

/**
 * Валидирует path-параметр имени ключа портала и сужает его тип
 * до {@link PortalKeyName}. Неизвестное имя → 400.
 */
export class ParsePortalKeyNamePipe
    implements PipeTransform<string, PortalKeyName>
{
    transform(value: string): PortalKeyName {
        if (!isPortalKeyName(value)) {
            throw new BadRequestException(
                `Неизвестный ключ портала «${value}». ` +
                    `Допустимые значения: ${PORTAL_KEY_NAMES.join(', ')}.`,
            );
        }
        return value;
    }
}
