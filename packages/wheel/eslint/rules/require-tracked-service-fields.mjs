/**
 * WHY THIS RULE EXISTS (the invisible playback-state bug):
 *
 * The debug panel can explain atoms, computeds, actions, and machines. A plain
 * mutable Service property has no registry entry and no write history. The
 * radio audit found the retry count, session epoch, and early-end slot behind
 * every repeated playback bug in fields like these:
 *
 *   private stallRetries = 0;                         // ❌ invisible writes
 *   private player: AudioContext | null = null;       // ❌ invisible handle
 *
 * `this.field()` stores the same mutable value without a Solid signal or deep
 * freeze, and records every replacement for the debug panel:
 *
 *   private readonly stallRetries = this.field(0);    // ✅ tracked, not reactive
 *   private readonly player = this.field<AudioContext | null>(null); // ✅ safe handle
 *
 * The rule reports non-readonly private properties on Service and SyncService
 * subclasses. Readonly dependencies and primitive wrappers stay legal. A
 * readonly Map or Set can still mutate internally without a `field.set()`;
 * syntax-only ESLint cannot prove those method calls are logical state writes,
 * so review must still separate durable registries from changing state.
 *
 * SUBCLASS DETECTION. Direct subclasses count, plus subclasses of a Service
 * class declared earlier in the same file. A parent imported from another
 * file needs type information this ESLint setup does not load.
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'mutable private Service state must use this.field() so debug history exists'
    },
    messages: {
      untracked:
        'Private Service field "{{name}}" is mutable but has no debug history. Declare `private readonly {{name}} = this.field(initial)`, then read and write it with `.get()` and `.set()`.'
    },
    schema: []
  },
  create(context) {
    const serviceClassNames = new Set();

    function isServiceClass(node) {
      const parent = node.superClass;
      return (
        parent?.type === 'Identifier' &&
        (parent.name === 'Service' || parent.name === 'SyncService' || serviceClassNames.has(parent.name))
      );
    }

    function checkClass(node) {
      if (!isServiceClass(node)) return;
      if (node.id?.name) serviceClassNames.add(node.id.name);
      for (const member of node.body.body) {
        if (member.type !== 'PropertyDefinition' || member.static || member.readonly) continue;
        const isPrivate = member.accessibility === 'private' || member.key?.type === 'PrivateIdentifier';
        if (!isPrivate) continue;
        const name = member.key?.type === 'Identifier' || member.key?.type === 'PrivateIdentifier'
          ? member.key.name
          : context.sourceCode.getText(member.key);
        context.report({ node: member, messageId: 'untracked', data: { name } });
      }
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass
    };
  }
};
