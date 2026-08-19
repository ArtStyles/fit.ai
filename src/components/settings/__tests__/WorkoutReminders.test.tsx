import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { WorkoutReminderControls } from '../WorkoutReminders'

describe('WorkoutReminderControls', () => {
  it('blocks both time and toggle controls while a native operation is pending', () => {
    const html = renderToStaticMarkup(
      <WorkoutReminderControls
        time="18:00"
        enabled
        busy
        timeLabel="Reminder time"
        toggleLabel="Disable reminders"
        onTimeChange={vi.fn()}
        onToggle={vi.fn()}
      />,
    )

    expect(html.match(/disabled=""/g)).toHaveLength(2)
    expect(html).toContain('aria-busy="true"')
  })
})
