import { describe, expect, it } from 'vitest'
import { findRetainedTemplateAssignment } from '../trainerTemplateAvailability'
const assignment = { id: 'assignment-a', client_user_id: 'client-a', source_template_id: 'template-a', relationship_id: 'previous-relationship', status: 'frozen' }
describe('retained template availability', () => {
  it('blocks the same client and template retained from a previous relationship', () => {
    expect(findRetainedTemplateAssignment([assignment], 'client-a', 'template-a')).toBe(assignment)
  })
  it('permits another template, another client, and reassignment after removal', () => {
    expect(findRetainedTemplateAssignment([assignment], 'client-a', 'template-b')).toBeUndefined()
    expect(findRetainedTemplateAssignment([assignment], 'client-b', 'template-a')).toBeUndefined()
    expect(findRetainedTemplateAssignment([{ ...assignment, status: 'cancelled' }], 'client-a', 'template-a')).toBeUndefined()
  })
})
