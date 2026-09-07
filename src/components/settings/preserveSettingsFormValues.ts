// React 19 resets forms when an action resolves, including returned errors.
// Settings edit existing values: keep the draft on failure and the saved values
// on success. Use a native listener because stable React disables synthetic
// event dispatch while committing the reset. React 19 calls this ref's cleanup
// when the form unmounts, including the Strict Mode setup/cleanup cycle.
export function preserveSettingsFormValues(form: HTMLFormElement | null) {
  if (!form) return
  const preventReset = (event: Event) => event.preventDefault()
  form.addEventListener('reset', preventReset)
  return () => form.removeEventListener('reset', preventReset)
}
