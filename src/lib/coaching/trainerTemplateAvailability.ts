type Assignment = { client_user_id: string; source_template_id: string | null; status: string }
export function findRetainedTemplateAssignment<T extends Assignment>(assignments: T[], clientId: string, templateId: string): T | undefined {
  return assignments.find(assignment => assignment.client_user_id === clientId && assignment.source_template_id === templateId && ['active', 'frozen', 'proposed'].includes(assignment.status))
}
