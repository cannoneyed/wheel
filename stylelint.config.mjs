const disallowedThemeValues = {
  '/^(?!--)/': [
    '/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/',
    '/\\b(?:rgba?|hsla?)\\s*\\(/'
  ]
};

const disallowedWheelValues = {
  ...disallowedThemeValues,
  '/^.*$/': [
    '/\\b(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:ms|s)\\b/'
  ]
};

const timingLiteral = /\b(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b/;

const disallowedValueMessage = (property, value) => {
  if (timingLiteral.test(value)) {
    return `Hardcoded timing in "${property}" bypasses the design-system motion scale. Define it in packages/wheel/src/components/styles/tokens.css and read it with var() (found "${value}").`;
  }
  return `Hardcoded color in "${property}" cannot follow the theme. Define it in a custom property and read it with var() (found "${value}").`;
};

/** @type {import('stylelint').Config} */
export default {
  reportDescriptionlessDisables: true,
  rules: {
    // WHY THIS RULE EXISTS: styling data-starting-style makes newly shown content
    // fade, slide, or scale in. Wheel renders entry state on the first frame and
    // reserves motion for exit, so a starting-style selector is always a defect.
    'selector-disallowed-list': [
      ['/\\[data-starting-style\\]/'],
      {
        message:
          'Entry motion is forbidden. Render the final state immediately and style only [data-ending-style] for exit motion.'
      }
    ],
    'declaration-property-value-disallowed-list': [
      disallowedThemeValues,
      {
        message: disallowedValueMessage
      }
    ]
  },
  overrides: [
    {
      files: [
        'packages/wheel/src/components/styles/base.css',
        'packages/wheel/src/components/styles/recipes/**/*.css'
      ],
      rules: {
        // WHY THIS RULE EXISTS: a timing literal in a recipe creates a private
        // motion scale. Wheel owns every duration and easing value in tokens.css
        // so one edit changes the full component system and review can find it.
        'declaration-property-value-disallowed-list': [
          disallowedWheelValues,
          { message: disallowedValueMessage }
        ]
      }
    }
  ]
};
