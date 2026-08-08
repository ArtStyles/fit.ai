export function trainerCredentialPath(
  userId: string,
  applicationId: string,
  credentialId: string,
  extension: string,
): string {
  return `${userId}/${applicationId}/${credentialId}.${extension}`
}
