import { render } from 'solid-js/web';

import './styles.css';
import 'wheel/components/styles';
import { Harness } from './harness';

render(() => <Harness />, document.getElementById('root')!);
