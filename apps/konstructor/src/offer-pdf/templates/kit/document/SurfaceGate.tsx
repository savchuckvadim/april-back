import type { FC } from 'react';
import { SplitGate } from '../infoblocks/SplitGate';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';

/** Место под начало карточки: заголовок раздела, первые строки и поля карточки */
const SURFACE_PRESENCE = 120;

export interface SurfaceGateProps {
    theme: OfferPdfTheme;
}

/**
 * Метка перед карточкой раздела: если до низа листа мало места, карточка
 * начинается со следующего. Иначе заголовок уезжал на новую страницу, а
 * внизу листа оставался пустой верх карточки. Без карточек — ничего.
 */
export const SurfaceGate: FC<SurfaceGateProps> = ({ theme }) =>
    theme.surface ? <SplitGate presence={SURFACE_PRESENCE} /> : null;
