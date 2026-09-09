function requiresServer(): never { throw new Error('Esta operación necesita el servicio en línea de Vekira. El entrenamiento y los datos locales siguen disponibles.') }
export const createServiceClient = requiresServer
export const createProductNotification = requiresServer
export const notifyPostLiked = requiresServer
export const notifyPostCommented = requiresServer
export const notifyFollowCreated = requiresServer
export const notifyFollowAccepted = requiresServer
export const callClaudeForChat = requiresServer
export const callClaudeForAdjustment = requiresServer
export const getAnthropicClient = requiresServer
export function randomUUID() { return crypto.randomUUID() }
