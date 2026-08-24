/**
 * WHY THIS RULE EXISTS (never store what you can derive — AGENTS.md rule 1):
 *
 * Inside a SyncService, a plain method that READS live reactive data but never
 * WRITES is a derivation in disguise. Derivations must be declared as
 * `readonly x = this.computed((…) => …)` so they are memoized per
 * change-version and referentially stable — a plain method recomputes on every
 * call and hands back a fresh array/object each time, invalidating every
 * downstream memo that reads it.
 *
 *   getOpenIssues() { return this.issuesView(team).rows.filter(...); }   // ❌ method
 *   readonly openIssues = this.computed(() => this.issuesView(...).rows); // ✅ computed
 *
 * WHAT COUNTS AS A "LIVE READ" (the narrow surface — this is the fix for a
 * false positive that used to flag ANY `.get(`):
 *
 * Only two shapes are the kernel's actual reactive-read surface, and both are
 * anchored to a class field of THIS service that we can see is a reactive
 * primitive:
 *
 *   1. `this.<field>.get()`         where <field> = this.atom(...)
 *   2. `this.<field>...rows|.status`  where <field> = this.liveQuery(...) or
 *                                     this.liveQueryFor(...) (the family
 *                                     form reads through a call: `this.view(id).rows`)
 *
 * So the rule walks the class body first, records which fields were
 * initialized from `this.atom(...)` / `this.liveQuery(...)` /
 * `this.liveQueryFor(...)`, and only then treats a `.get()` / `.rows` /
 * `.status` as a live read when its receiver roots at one of those fields.
 * A plain `Map.get(...)` or `someHelper.get()` in a service method is no longer
 * mistaken for a reactive read.
 *
 * WRITES stay broad on purpose: any `.set` / `.update` / `.mutate` / `.put` /
 * `.delete` in the method suppresses the report. Over-matching a write only
 * makes the rule quieter (a method that mutates is never a pure derivation),
 * so there is no false-positive risk in keeping that side loose.
 *
 * SUBCLASS DETECTION — a documented limitation. A class counts as a service if
 * it `extends SyncService`, OR extends another class in THE SAME FILE that we
 * already saw extend SyncService (transitive within the file). What this
 * CANNOT catch without the type checker: a subclass whose parent lives in a
 * different file (`class Foo extends BaseService` where BaseService extends
 * SyncService elsewhere). Detecting that soundly needs type information ESLint
 * does not have here; a name-only heuristic ("ends with Service") would both
 * miss and misfire. In this codebase every service extends SyncService
 * directly, so the gap is currently empty — but it is a gap, named here rather
 * than pretended away.
 */
const READ_VIEW_PROPS = new Set(['rows', 'status']);
const WRITE_PROPS = new Set(['set', 'mutate', 'put', 'update', 'delete']);
const ATOM_FACTORIES = new Set(['atom']);
const LIVE_FACTORIES = new Set(['liveQuery', 'liveQueryFor']);

/** Is this initializer `this.<factory>(...)` for one of the given factory names? */
function initializerFactory(value, factories) {
  if (value?.type !== 'CallExpression') return false;
  const callee = value.callee;
  return (
    callee?.type === 'MemberExpression' &&
    callee.object?.type === 'ThisExpression' &&
    callee.property?.type === 'Identifier' &&
    factories.has(callee.property.name)
  );
}

/** Does `node` root at `this.<field>` (optionally called, for families) with field in the set? */
function rootsAtThisField(node, fieldSet) {
  let base = node;
  // `this.view(id)` — peel the family call to reach the member expression.
  if (base?.type === 'CallExpression') base = base.callee;
  return (
    base?.type === 'MemberExpression' &&
    base.object?.type === 'ThisExpression' &&
    base.property?.type === 'Identifier' &&
    fieldSet.has(base.property.name)
  );
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'service derivations must be computed(), not plain methods' },
    messages: {
      preferComputed:
        'Method "{{name}}" derives from live data — declare it as `readonly {{name}} = this.computed((…) => …)` so it is memoized and referentially stable (AGENTS.md rule 1).'
    },
    schema: []
  },
  create(context) {
    // Class names seen (top-down) to extend SyncService, directly or through a
    // same-file ancestor. Declarations must textually follow their parent, so
    // building this as we visit works.
    const syncClassNames = new Set();

    function extendsSyncService(node) {
      const superClass = node.superClass;
      if (superClass?.type !== 'Identifier') return false;
      return superClass.name === 'SyncService' || syncClassNames.has(superClass.name);
    }

    /** Collect atom fields and liveQuery fields from the class body. */
    function collectReactiveFields(cls) {
      const atomFields = new Set();
      const liveFields = new Set();
      for (const member of cls.body.body) {
        if (member.type !== 'PropertyDefinition' || member.key?.type !== 'Identifier') continue;
        if (initializerFactory(member.value, ATOM_FACTORIES)) {
          atomFields.add(member.key.name);
        } else if (initializerFactory(member.value, LIVE_FACTORIES)) {
          liveFields.add(member.key.name);
        }
      }
      return { atomFields, liveFields };
    }

    function scanMethod(body, atomFields, liveFields) {
      let reads = false;
      let writes = false;
      const visit = (node) => {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
          // Live view read: this.<liveField>...rows / .status
          if (READ_VIEW_PROPS.has(node.property.name) && rootsAtThisField(node.object, liveFields)) {
            reads = true;
          }
          // Broad write signal (see WHY: over-matching writes is safe).
          if (WRITE_PROPS.has(node.property.name)) writes = true;
        }
        if (node.type === 'CallExpression') {
          // Atom read: this.<atomField>.get()
          const callee = node.callee;
          if (
            callee?.type === 'MemberExpression' &&
            callee.property?.type === 'Identifier' &&
            callee.property.name === 'get' &&
            rootsAtThisField(callee.object, atomFields)
          ) {
            reads = true;
          }
        }
        for (const key of Object.keys(node)) {
          if (key === 'parent') continue;
          const value = node[key];
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value.type === 'string') visit(value);
        }
      };
      visit(body);
      return { reads, writes };
    }

    function checkClass(cls) {
      if (!extendsSyncService(cls)) return;
      if (cls.id?.name) syncClassNames.add(cls.id.name);
      const { atomFields, liveFields } = collectReactiveFields(cls);
      for (const member of cls.body.body) {
        if (member.type !== 'MethodDefinition' || member.kind !== 'method' || member.static) continue;
        const { reads, writes } = scanMethod(member.value.body, atomFields, liveFields);
        if (reads && !writes) {
          context.report({
            node: member,
            messageId: 'preferComputed',
            data: { name: member.key?.name ?? '?' }
          });
        }
      }
    }

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass
    };
  }
};
