jest.mock('@react-pdf/renderer', () =>
    jest
        .requireActual<
            typeof import('./helpers/react-pdf.mock')
        >('./helpers/react-pdf.mock')
        .createReactPdfMock(),
);

import { FACET_PALETTES } from '../templates/facet/facet.theme';
import { HALO_THEME } from '../templates/halo/halo.theme';
import { ISKRA_THEME } from '../templates/iskra/iskra.theme';
import {
    footerGradientHeight,
    footerLineKind,
} from '../templates/kit/chrome/footer-line.util';
import { LAVENDER_PALETTES } from '../templates/lavender/lavender.theme';
import { MODERNE_THEME } from '../templates/moderne/moderne.theme';
import { PEARL_THEME } from '../templates/pearl/pearl.theme';

describe('черта подвала', () => {
    it('по теме: рамка стиля, градиент темы или линия акцента', () => {
        expect(footerLineKind(PEARL_THEME)).toBe('accent');
        expect(footerLineKind(HALO_THEME)).toBe('gradient');
        expect(footerLineKind(FACET_PALETTES[0].theme)).toBe('border');
    });

    it('рамка стиля важнее градиента темы', () => {
        const lavender = LAVENDER_PALETTES[0].theme;
        expect(lavender.colors.gradient).toBeDefined();
        expect(footerLineKind(lavender)).toBe('border');
    });

    it('толщина градиентной черты — своя у «Ореола», у остальных 2 pt', () => {
        expect(footerGradientHeight(HALO_THEME)).toBe(2.5);
        expect(footerGradientHeight(MODERNE_THEME)).toBe(2);
        expect(footerGradientHeight(ISKRA_THEME)).toBe(2);
    });
});
