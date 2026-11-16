import type { FC } from 'react';
import { Path, Svg } from '@react-pdf/renderer';
import type { OfferPdfTheme } from '../../kit/theme/offer-pdf-theme';
import { facetColor, type Facet } from '../lib/facet-shapes.util';

export interface FacetShapesProps {
    facets: readonly Facet[];
    width: number;
    height: number;
    theme: OfferPdfTheme;
}

/** Грани вектором в цветах гаммы */
export const FacetShapes: FC<FacetShapesProps> = ({
    facets,
    width,
    height,
    theme,
}) => (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {facets.map(facet => (
            <Path
                key={facet.d}
                d={facet.d}
                fill={facetColor(facet.tone, theme)}
                fillOpacity={facet.opacity}
            />
        ))}
    </Svg>
);
