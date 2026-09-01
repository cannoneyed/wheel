/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
/* eslint-disable wheel/require-view-root -- Isolated catalog fixtures render library parts and icons; the catalog owns their inspection boundary. */
import { ScrollArea } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleScrollArea() {
  return (
    <ScrollArea.Root data-testid="scroll-root" style={{ width: '24rem', height: '8.5rem', 'max-width': 'calc(100vw - 8rem)' }}>
      <ScrollArea.Viewport data-testid="scroll-viewport">
        <ScrollArea.Content>
          <p style={{ margin: 0 }}>
            Vernacular architecture is building done outside any academic tradition, and without
            professional guidance. It is not a particular architectural movement or style, but
            rather a broad category, encompassing a wide range and variety of building types, with
            differing methods of construction, from around the world, both historical and extant
            and classical and modern. Vernacular architecture constitutes 95% of the world's built
            environment, as estimated in 1995 by Amos Rapoport, as measured against the small
            percentage of new buildings every year designed by architects and built by engineers.
          </p>
          <p style={{ margin: 0 }}>
            This type of architecture usually serves immediate, local needs, is constrained by the
            materials available in its particular region and reflects local traditions and
            cultural practices. The study of vernacular architecture does not examine formally
            schooled architects, but instead that of the design skills and tradition of local
            builders, who were rarely given any attribution for the work. More recently,
            vernacular architecture has been examined by designers and the building industry in an
            effort to be more energy conscious with contemporary design and construction—part of a
            broader interest in sustainable design.
          </p>
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar data-testid="scrollbar">
        <ScrollArea.Thumb data-testid="scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
