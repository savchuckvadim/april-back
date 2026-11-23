import type { FC, ReactNode } from 'react';
import { View } from '@react-pdf/renderer';
import { SPLIT_PRESENCE } from './infoblocks.layout';
import type { InfoblocksLead } from './infoblocks-lead';
import { SplitGate } from './SplitGate';

export interface HeadWithFirstProps {
    /** Блок перед заголовком группы (заголовок комплекта); держится вместе с ним */
    lead?: InfoblocksLead;
    /** Заголовок группы; null — у группы нет своего заголовка */
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
 * Блок перед группой (`lead`) идёт в той же связке: он не остаётся последним
 * на листе, а неделимая обёртка по-прежнему малая — заголовок и первый пункт.
 */
export const HeadWithFirst: FC<HeadWithFirstProps> = ({
    lead,
    head,
    first,
    firstLong,
    headHeight,
}) =>
    firstLong ? (
        <>
            <SplitGate
                presence={(lead?.height ?? 0) + headHeight + SPLIT_PRESENCE}
            />
            {lead?.node}
            {head}
            {first}
        </>
    ) : (
        <View wrap={false}>
            {lead?.node}
            {head}
            {first}
        </View>
    );
