import type { FC } from 'react';
import { Text } from '@react-pdf/renderer';
import { classicStyles } from '../../classic.styles';
import { infoblocksStyles as styles } from './infoblocks.styles';

export interface InfoblockNameProps {
    name: string;
}

/** Название блока в левой колонке таблицы */
export const InfoblockName: FC<InfoblockNameProps> = ({ name }) => (
    <Text style={[styles.tdText, classicStyles.bold]}>{name}</Text>
);
