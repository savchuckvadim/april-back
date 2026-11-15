import type { FC, ReactNode } from 'react';
import { View } from '@react-pdf/renderer';
import { SPLIT_PRESENCE } from './infoblocks.layout';
import { SplitGate } from './SplitGate';

export interface HeadWithFirstProps {
    /** Заголовок группы */
    head: ReactNode;
    /** Первый пункт группы — без своей метки разрыва */
    first: ReactNode;
    /** Первый пункт длинный и режется по странице */
    firstLong: boolean;
    /** Высота заголовка, пт */
    headHeight: number;
}

/**
 * Заголовок группы держится вместе с первым пунктом, чтобы не остаться
 * одним внизу листа (minPresenceAhead у самого заголовка не спасал).
 * Короткий пункт — общая неразрывная обёртка; длинный в неё не влезет,
 * поэтому перед заголовком метка на заголовок плюс начало пункта.
 */
export const HeadWithFirst: FC<HeadWithFirstProps> = ({
    head,
    first,
    firstLong,
    headHeight,
}) =>
    firstLong ? (
        <>
            <SplitGate presence={headHeight + SPLIT_PRESENCE} />
            {head}
            {first}
        </>
    ) : (
        <View wrap={false}>
            {head}
            {first}
        </View>
    );
