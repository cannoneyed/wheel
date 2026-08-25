/**
 * A service's identity has to be data, not a compiler flag.
 *
 * Every debug surface prints the service class name — the state tree's rows,
 * the `serviceName` on each atom and action, `actService` lookups, annotation
 * timelines. A minifier renames the class, so the name is DECLARED
 * (`static override serviceName`, enforced by `require-service-name`) and the
 * class name is only the fallback.
 *
 * The subtle one is inheritance: statics inherit, so a subclass that does not
 * declare its own must NOT silently answer with its parent's name.
 */
import { describe, expect, it } from 'vitest';

import { Service, ServiceContext } from './services';
import { serviceDisplayName } from './debug-registry';

class DeclaredService extends Service {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'DeclaredService';

  readonly count = this.atom(0, 'count');
}

// eslint-disable-next-line wheel/require-service-name -- the fallback is what this fixture tests
class UndeclaredService extends Service {
  readonly count = this.atom(0, 'count');
}

class ChildDeclares extends DeclaredService {
  /** Identity that survives minification (see require-service-name). */
  static override serviceName = 'ChildDeclares';
}

// eslint-disable-next-line wheel/require-service-name -- an undeclared subclass is the hazard under test
class ChildInherits extends DeclaredService {}

describe('serviceDisplayName', () => {
  it('prefers the declared name', () => {
    expect(serviceDisplayName(DeclaredService)).toBe('DeclaredService');
  });

  it('falls back to the class name when nothing is declared', () => {
    expect(serviceDisplayName(UndeclaredService)).toBe('UndeclaredService');
  });

  it('uses a subclass own declaration', () => {
    expect(serviceDisplayName(ChildDeclares)).toBe('ChildDeclares');
  });

  it('does not let a subclass inherit its parent identity', () => {
    // Statics inherit, so a naive read would call this 'DeclaredService' and
    // the state tree would show two different services under one name.
    expect(serviceDisplayName(ChildInherits)).toBe('ChildInherits');
  });
});

describe('declared identity in the debug graph', () => {
  it('labels the service and stamps its primitives with the declared name', () => {
    const context = new ServiceContext();
    context.get(DeclaredService);

    const snapshot = context.registry.snapshot();
    expect(snapshot.services.map((service) => service.name)).toContain('DeclaredService');

    const atom = snapshot.primitives.find((entry) => entry.meta.name === 'count');
    expect(atom?.meta.serviceName).toBe('DeclaredService');
  });
});
