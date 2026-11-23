import type { FC } from 'react';
import { Text, View } from '@react-pdf/renderer';
import { OfferPdfDocumentModel } from '../../../model/offer-pdf-document.model';
import { baseStyles } from '../base.styles';
import { onSurface } from '../document/surface.styles';
import { SurfaceGate } from '../document/SurfaceGate';
import { HEADING_PRESENCE } from '../document/section.layout';
import { SplitGate } from './SplitGate';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { ComplectInfoblocks } from './ComplectInfoblocks';
import { printedComplectSections } from './complect-sections.util';
import { groupsWithItems } from './infoblock-description.util';
import { infoblocksStyles } from './infoblocks.styles';
import { InfoblocksView } from './InfoblocksView';

export interface OfferInfoblocksProps {
    model: OfferPdfDocumentModel;
    theme: OfferPdfTheme;
}

/**
 * Информационное наполнение комплекта: список или таблица, описание по режиму.
 * Общий набор из нескольких комплектов с видом «по комплектам»
 * (`IsComplectsSeparate`) печатается разделами: у каждого комплекта свой
 * заголовок и своё наполнение в том же виде и режиме описаний.
 */
export const OfferInfoblocks: FC<OfferInfoblocksProps> = ({ model, theme }) => {
    const { data, settings } = model;
    const sections = printedComplectSections(data);
    const groups = groupsWithItems(data.infoblocksByGroups ?? []);
    if (!sections && groups.length === 0) return null;
    const base = baseStyles(theme);

    return (
        <>
            <SurfaceGate theme={theme} />
            <View style={onSurface(theme, base.section)}>
                {/* заголовок не остаётся последним на листе и не рвётся: minPresenceAhead на самом тексте react-pdf соблюдает не всегда, а разорванный заголовок оставлял внизу пустой узел */}
                <SplitGate presence={HEADING_PRESENCE} />
                <Text
                    style={base.h2}
                    wrap={false}
                    minPresenceAhead={HEADING_PRESENCE}
                >
                    Информационное наполнение
                </Text>
                {sections ? (
                    // у каждого комплекта свой заголовок: общее название набора не нужно
                    sections.map((section, index) => (
                        <ComplectInfoblocks
                            key={index}
                            section={section}
                            settings={settings}
                            theme={theme}
                        />
                    ))
                ) : (
                    <>
                        {data.GeneralProductName ? (
                            <Text style={infoblocksStyles(theme).complectName}>
                                {data.GeneralProductName}
                            </Text>
                        ) : null}
                        <InfoblocksView
                            groups={groups}
                            settings={settings}
                            theme={theme}
                        />
                    </>
                )}
            </View>
        </>
    );
};
