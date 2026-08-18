import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n'
import { avatarUploadFailureToast } from '../AvatarUploader'

describe('avatarUploadFailureToast', () => {
  it('translates an avatar upload error before exposing it in an English toast', () => {
    expect(avatarUploadFailureToast(
      source => translate('en', source),
      'No se pudo subir la imagen.',
    )).toEqual({
      title: 'Could not save photo',
      description: 'Could not upload the image.',
      variant: 'error',
    })
  })
})
