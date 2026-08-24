/** @type {import('stylelint').Config} */
export default {
  reportDescriptionlessDisables: true,
  rules: {
    'declaration-property-value-disallowed-list': [
      {
        '/^(?!--)/': [
          '/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-fA-F])/',
          '/\\b(?:rgba?|hsla?)\\s*\\(/'
        ]
      },
      {
        message: (property, value) =>
          `Hardcoded color in "${property}" cannot follow the theme. Define it in a custom property and read it with var() (found "${value}").`
      }
    ]
  }
};
