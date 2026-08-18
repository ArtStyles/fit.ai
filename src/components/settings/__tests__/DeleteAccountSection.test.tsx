import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '@/components/i18n/I18nProvider'
import { DeleteAccountConfirmationForm } from '../DeleteAccountSection'

vi.mock('@/app/actions/account', () => ({ deleteAccount: '/delete-account' }))
vi.mock('@/components/feedback/SubmitButton', () => ({
  SubmitButton: ({ children }: { children: React.ReactNode }) => (
    <button type="submit">{children}</button>
  ),
}))

describe('DeleteAccountConfirmationForm', () => {
  it('renders the destructive confirmation input with a 44px target', () => {
    const html = renderToStaticMarkup(
      <I18nProvider language="en" syncDocumentLanguage={false}>
        <DeleteAccountConfirmationForm
          confirmWord="DELETE"
          text=""
          canDelete={false}
          onTextChange={vi.fn()}
          onCancel={vi.fn()}
        />
      </I18nProvider>,
    )

    expect(html).toMatch(/<input[^>]*name="confirmText"[^>]*class="[^"]*h-11[^"]*"/)
  })
})
