/**
 * The wheel eslint plugin — AGENTS.md's rules, enforced. Plain ESM, no build
 * step; wire it from the consuming repo's eslint.config.mjs (a rule that
 * isn't wired doesn't exist).
 *
 * Scoping doctrine: enforcement is default-on for app code — an opt-in rule
 * silently stops covering new files. Escape hatches are pragmas in the file,
 * greppable, never ambient glob gaps.
 */
import requireExportJsdoc from './rules/require-export-jsdoc.mjs';
import preferComputed from './rules/prefer-computed.mjs';
import connectOnly from './rules/connect-only.mjs';
import requireMemberJsdoc from './rules/require-member-jsdoc.mjs';
import noWholeServiceInjection from './rules/no-whole-service-injection.mjs';
import requireEffectReason from './rules/require-effect-reason.mjs';
import singleConnect from './rules/single-connect.mjs';
import maxConnectSurface from './rules/max-connect-surface.mjs';
import singleConnectPerFile from './rules/single-connect-per-file.mjs';
import invertReturnType from './rules/invert-return-type.mjs';
import noHandlesInAtoms from './rules/no-handles-in-atoms.mjs';
import noOptionalComputedArgs from './rules/no-optional-computed-args.mjs';
import noBarrelIconImports from './rules/no-barrel-icon-imports.mjs';
import requireComponentRoot from './rules/require-component-root.mjs';
import noUnusedImports from './rules/no-unused-imports.mjs';
import noCrossLayerImports from './rules/no-cross-layer-imports.mjs';
import noCalledViewRead from './rules/no-called-view-read.mjs';
import noRawTimers from './rules/no-raw-timers.mjs';
import noTeardownBooleans from './rules/no-teardown-booleans.mjs';
import noRawLocation from './rules/no-raw-location.mjs';
import noRawAnchorNavigation from './rules/no-raw-anchor-navigation.mjs';
import noEarlyFieldRead from './rules/no-early-field-read.mjs';
import requireBehaviorId from './rules/require-behavior-id.mjs';
import requireViewRoot from './rules/require-view-root.mjs';
import requireStableInstanceName from './rules/require-stable-instance-name.mjs';
import noRawConsole from './rules/no-raw-console.mjs';
import requireComponentStates from './rules/require-component-states.mjs';
import requireTrackedShow from './rules/require-tracked-show.mjs';
import requireUseSignal from './rules/require-use-signal.mjs';
import requireViewProps from './rules/require-view-props.mjs';
import requireConnectProps from './rules/require-connect-props.mjs';
import noHardcodedColor from './rules/no-hardcoded-color.mjs';
import noSnakeCaseMismatchInPrune from './rules/no-snake-case-mismatch-in-prune.mjs';
import requireKeepNames from './rules/require-keep-names.mjs';
import noRawSqlPlaceholders from './rules/no-raw-sql-placeholders.mjs';
import requireLatestAsyncTaskWait from './rules/require-latest-async-task-wait.mjs';
import requireTrackedServiceFields from './rules/require-tracked-service-fields.mjs';
import noDevModeShow from './rules/no-dev-mode-show.mjs';
import noDirectiveOnComponent from './rules/no-directive-on-component.mjs';
import noDirectMaterializerWrites from './rules/no-direct-materializer-writes.mjs';
import noWorkerDataExports from './rules/no-worker-data-exports.mjs';

export default {
  meta: { name: 'wheel' },
  rules: {
    'require-export-jsdoc': requireExportJsdoc,
    'prefer-computed': preferComputed,
    'connect-only': connectOnly,
    'require-member-jsdoc': requireMemberJsdoc,
    'no-whole-service-injection': noWholeServiceInjection,
    'require-effect-reason': requireEffectReason,
    'single-connect': singleConnect,
    'max-connect-surface': maxConnectSurface,
    'single-connect-per-file': singleConnectPerFile,
    'invert-return-type': invertReturnType,
    'no-handles-in-atoms': noHandlesInAtoms,
    'no-optional-computed-args': noOptionalComputedArgs,
    'no-barrel-icon-imports': noBarrelIconImports,
    'require-component-root': requireComponentRoot,
    'require-view-root': requireViewRoot,
    'require-stable-instance-name': requireStableInstanceName,
    'no-raw-console': noRawConsole,
    'require-component-states': requireComponentStates,
    'require-tracked-show': requireTrackedShow,
    'require-use-signal': requireUseSignal,
    'require-view-props': requireViewProps,
    'require-connect-props': requireConnectProps,
    'no-unused-imports': noUnusedImports,
    'no-cross-layer-imports': noCrossLayerImports,
    'no-called-view-read': noCalledViewRead,
    'no-raw-timers': noRawTimers,
    'no-teardown-booleans': noTeardownBooleans,
    'no-raw-location': noRawLocation,
    'no-raw-anchor-navigation': noRawAnchorNavigation,
    'no-early-field-read': noEarlyFieldRead,
    'require-behavior-id': requireBehaviorId,
    'no-hardcoded-color': noHardcodedColor,
    'no-snake-case-mismatch-in-prune': noSnakeCaseMismatchInPrune,
    'require-keep-names': requireKeepNames,
    'no-raw-sql-placeholders': noRawSqlPlaceholders,
    'require-latest-async-task-wait': requireLatestAsyncTaskWait,
    'require-tracked-service-fields': requireTrackedServiceFields,
    'no-dev-mode-show': noDevModeShow,
    'no-directive-on-component': noDirectiveOnComponent,
    'no-direct-materializer-writes': noDirectMaterializerWrites,
    'no-worker-data-exports': noWorkerDataExports
  }
};
