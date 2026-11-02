/**
 * Вход из админки → полное предложение.
 *
 * Не указанная цена означает «как в прайсе», а не ноль: иначе пустое поле
 * формы превратилось бы в услугу за 0 ₽. Поэтому каждое поле проходит через
 * явную подстановку значения по умолчанию.
 */
import type { RenewalOfferInputDto } from '../dto/renewal-offer.dto';
import {
    RENEWAL_LIMITS,
    RENEWAL_PRICE_DEFAULTS,
    type RenewalExtraLine,
    type RenewalOffer,
} from './renewal-offer.model';

const pick = <T>(value: T | undefined | null, fallback: T): T =>
    value === undefined || value === null ? fallback : value;

const clamp = (value: number, min: number, max: number): number =>
    Math.min(max, Math.max(min, Math.round(value)));

/** Строки без названия отбрасываем: это недозаполненная форма, а не услуга. */
function normalizeExtras(
    extras: RenewalOfferInputDto['extras'],
): RenewalExtraLine[] {
    if (!extras?.length) return [];
    return extras
        .filter(line => line.title?.trim())
        .slice(0, RENEWAL_LIMITS.extras.max)
        .map(line => ({
            title: line.title.trim().slice(0, 255),
            price: clamp(
                line.price ?? 0,
                RENEWAL_LIMITS.price.min,
                RENEWAL_LIMITS.price.max,
            ),
            period: line.period === 'once' ? 'once' : 'month',
        }));
}

/** Собирает полное предложение из того, что пришло в запросе. */
export function normalizeRenewalOffer(
    input: RenewalOfferInputDto,
): RenewalOffer {
    const d = RENEWAL_PRICE_DEFAULTS;
    const { price, employees, hours } = RENEWAL_LIMITS;

    const label = input.adjustmentLabel?.trim();

    return {
        clientName: input.clientName.trim().slice(0, 255),

        salesIncluded: pick(input.salesIncluded, true),
        salesPrice: clamp(
            pick(input.salesPrice, d.sales),
            price.min,
            price.max,
        ),

        aiIncluded: pick(input.aiIncluded, true),
        aiEmployees: clamp(
            pick(input.aiEmployees, d.aiBaseEmployees),
            employees.min,
            employees.max,
        ),
        aiBasePrice: clamp(
            pick(input.aiBasePrice, d.aiBase),
            price.min,
            price.max,
        ),
        aiBaseEmployees: clamp(
            pick(input.aiBaseEmployees, d.aiBaseEmployees),
            employees.min,
            employees.max,
        ),
        aiExtraPrice: clamp(
            pick(input.aiExtraPrice, d.aiExtra),
            price.min,
            price.max,
        ),
        aiFreeDelta: clamp(
            pick(input.aiFreeDelta, d.aiFreeDelta),
            0,
            employees.max,
        ),

        managerIncluded: pick(input.managerIncluded, false),
        managerPrice: clamp(
            pick(input.managerPrice, d.manager),
            price.min,
            price.max,
        ),

        devIncluded: pick(input.devIncluded, true),
        devHours: clamp(pick(input.devHours, d.devHours), hours.min, hours.max),
        devHourPrice: clamp(
            pick(input.devHourPrice, d.devHour),
            price.min,
            price.max,
        ),

        // Скидка со знаком, поэтому границы симметричные.
        adjustment: clamp(pick(input.adjustment, 0), -price.max, price.max),
        adjustmentLabel: label ? label.slice(0, 255) : 'Скидка',

        extras: normalizeExtras(input.extras),
    };
}
