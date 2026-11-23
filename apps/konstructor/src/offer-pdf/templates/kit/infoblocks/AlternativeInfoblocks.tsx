import type { FC } from 'react';
import type { OfferPdfSettings } from '../../../model/offer-pdf-settings';
import type { OfferPdfTheme } from '../theme/offer-pdf-theme';
import { AlternativeBlockHead } from './AlternativeBlockHead';
import { AlternativeSetHead } from './AlternativeSetHead';
import {
    estimateAlternativeBlockHeadHeight,
    estimateAlternativeSetHeadHeight,
} from './alternative-head.util';
import type { PrintedAlternativeSet } from './alternative-sets.util';
import { ComplectInfoblocks } from './ComplectInfoblocks';
import { joinLeads, type InfoblocksLead } from './infoblocks-lead';

export interface AlternativeInfoblocksProps {
    sets: PrintedAlternativeSet[];
    settings: Pick<OfferPdfSettings, 'descriptionMode' | 'viewMode'>;
    theme: OfferPdfTheme;
}

/**
 * Блок над первым комплектом набора: плашка набора, а у первого набора перед
 * ней ещё общий заголовок блока. Он идёт в связке с заголовком комплекта и
 * первой группой.
 */
const setLead = (
    set: PrintedAlternativeSet,
    withBlockHead: boolean,
    theme: OfferPdfTheme,
): InfoblocksLead => {
    const setHead: InfoblocksLead = {
        node: <AlternativeSetHead title={set.title} theme={theme} />,
        height: estimateAlternativeSetHeadHeight(theme, set.title),
    };
    if (!withBlockHead) return setHead;
    return (
        joinLeads(
            {
                node: <AlternativeBlockHead theme={theme} />,
                height: estimateAlternativeBlockHeadHeight(theme),
            },
            setHead,
        ) ?? setHead
    );
};

/**
 * Блок «Наполнение наборов для сравнения»: общий заголовок, затем у каждого
 * набора плашка с заголовком и разделы его комплектов в том же виде и режиме
 * описаний, что у общего набора (ComplectInfoblocks).
 */
export const AlternativeInfoblocks: FC<AlternativeInfoblocksProps> = ({
    sets,
    settings,
    theme,
}) => (
    <>
        {sets.map((set, setIndex) =>
            set.sections.map((section, sectionIndex) => (
                <ComplectInfoblocks
                    key={`${setIndex}-${sectionIndex}`}
                    section={section}
                    settings={settings}
                    theme={theme}
                    before={
                        sectionIndex === 0
                            ? setLead(set, setIndex === 0, theme)
                            : undefined
                    }
                />
            )),
        )}
    </>
);
