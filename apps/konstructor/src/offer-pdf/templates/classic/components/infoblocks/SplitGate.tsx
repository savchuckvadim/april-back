import type { FC } from 'react';
import { View } from '@react-pdf/renderer';

export interface SplitGateProps {
    /** Сколько места нужно ниже метки, чтобы блок начался на этом листе */
    presence: number;
}

/**
 * Невидимая метка перед длинным блоком: если до низа листа меньше
 * `presence`, блок начинается со следующего листа, а не одной строкой внизу.
 * minPresenceAhead работает только среди соседей — поэтому группы наполнения
 * собираются фрагментами, а не обёртками.
 */
export const SplitGate: FC<SplitGateProps> = ({ presence }) => (
    <View minPresenceAhead={presence} />
);
