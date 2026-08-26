import { render } from 'solid-js/web';

import 'wheel/components/styles';
import './styles.css';
import './component-demos.css';
import './catalog.css';
import { ComponentCatalog } from './component-catalog';

render(() => <ComponentCatalog />, document.getElementById('root')!);
