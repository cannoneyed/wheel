/* eslint-disable wheel/require-component-role -- The catalog demonstrates the components themselves: every fixture here IS a Button or a Dialog, so a role would name the catalog rather than tell two instances of one app apart. */
import { Tabs } from 'wheel/components';

// Wheel supplies the component recipe classes.
// The indicator animates via the library-measured --active-tab-* variables.
export default function ExampleTabs() {
  return (
    <Tabs.Root style={{ width: '100%', 'max-width': '20rem' }} defaultValue="overview">
      <Tabs.List>
        <Tabs.Tab value="overview">
          Overview
        </Tabs.Tab>
        <Tabs.Tab value="projects">
          Projects
        </Tabs.Tab>
        <Tabs.Tab value="account">
          Account
        </Tabs.Tab>
        <Tabs.Indicator />
      </Tabs.List>
      <Tabs.Panel value="overview">
        Workspace stats and activity.
      </Tabs.Panel>
      <Tabs.Panel value="projects">
        Milestones and deadlines.
      </Tabs.Panel>
      <Tabs.Panel value="account">
        Profile and preferences.
      </Tabs.Panel>
    </Tabs.Root>
  );
}
