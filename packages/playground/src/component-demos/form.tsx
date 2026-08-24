import { useSignal } from 'wheel/core';
import { Button, Field, Form } from 'wheel/components';

// Wheel supplies the component recipe classes.
export default function ExampleForm() {
  const [errors, setErrors] = useSignal({}, 'errors');
  const [loading, setLoading] = useSignal(false, 'loading');

  return (
    <Form
      style={{ 'max-width': '16rem' }}
      errors={errors()}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget as HTMLFormElement);
        const value = formData.get('url') as string;

        setLoading(true);
        const response = submitForm(value);
        const serverErrors = {
          url: response.error,
        };

        setErrors(serverErrors);
        setLoading(false);
      }}
    >
      <Field.Root name="url">
        <Field.Label>Homepage</Field.Label>
        <Field.Control
          type="url"
          required
          defaultValue="https://example.com"
          placeholder="https://example.com"
          pattern="https?://.*"
        />
        <Field.Error />
      </Field.Root>
      <Button type="submit" disabled={loading()} focusableWhenDisabled>
        Submit
      </Button>
    </Form>
  );
}

function submitForm(value: string) {
  try {
    const url = new URL(value);

    if (url.hostname.endsWith('example.com')) {
      return { error: 'The example domain is not allowed' };
    }
  } catch {
    return { error: 'This is not a valid URL' };
  }

  return { success: true };
}
