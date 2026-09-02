import { describe, expect, it } from 'vitest'
import { createTranslator, normalizeLanguage, translate } from '..'

describe('UI translations', () => {
  it('normalizes unsupported languages to Spanish', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('fr')).toBe('es')
    expect(normalizeLanguage(null)).toBe('es')
  })

  it('translates known copy and safely falls back for unknown copy', () => {
    expect(translate('en', 'Ajustes')).toBe('Settings')
    expect(translate('es', 'Ajustes')).toBe('Ajustes')
    expect(translate('en', 'Abrir ajustes')).toBe('Open settings')
    expect(translate('es', 'Abrir ajustes')).toBe('Abrir ajustes')
    expect(translate('en', 'Vekira')).toBe('Vekira')
    expect(translate('en', 'Actualizando contenido')).toBe('Updating content')
  })

  it('interpolates translated values', () => {
    const t = createTranslator('en')
    expect(t('Página {page}', { page: 3 })).toBe('Page 3')
  })

  it.each([
    ['Objetivo y experiencia', 'Goal and experience'],
    ['Disponibilidad', 'Availability'],
    ['Espacio y equipo', 'Space and equipment'],
    ['Seguridad', 'Safety'],
    ['{count} días por semana', '{count} days per week'],
    ['Mancuernas', 'Dumbbells'],
    ['Barra', 'Barbell'],
    ['Banco', 'Bench'],
    ['Bandas', 'Resistance bands'],
    ['Polea o cable', 'Cable machine'],
    ['Barra de dominadas', 'Pull-up bar'],
    ['Lunes', 'Monday'],
    ['Domingo', 'Sunday'],
    ['Estado de preparación', 'Readiness status'],
    ['Listo para entrenar.', 'Ready to train.'],
    ['Entrena con las adaptaciones indicadas.', 'Train with the indicated adaptations.'],
    ['Consulta a un profesional antes de entrenar.', 'Consult a professional before training.'],
    ['Completa tu información de preparación para recibir orientación.', 'Complete your readiness information to receive guidance.'],
    ['Quita {count} día para continuar.', 'Remove {count} day to continue.'],
    ['Quita {count} días para continuar.', 'Remove {count} days to continue.'],
    ['Elige {count} día más para continuar.', 'Choose {count} more day to continue.'],
    ['Elige {count} días más para continuar.', 'Choose {count} more days to continue.'],
    ['Guardar preferencias', 'Save preferences'],
    ['Guardando preferencias', 'Saving preferences'],
    ['No se pudieron guardar las preferencias de entrenamiento.', 'Could not save training preferences.'],
    ['Reintentar carga de entrenamiento', 'Retry loading training settings'],
  ])('translates structured training settings copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Información personal', 'Personal information'],
    ['Datos opcionales para adaptar tus recomendaciones.', 'Optional information used to tailor your recommendations.'],
    ['Altura', 'Height'],
    ['En centímetros, entre 100 y 250.', 'In centimeters, between 100 and 250.'],
    ['Fecha de nacimiento', 'Date of birth'],
    ['Debes tener entre 18 y 100 años.', 'You must be between 18 and 100 years old.'],
    ['Este dato es opcional.', 'This information is optional.'],
    ['Peso actual', 'Current weight'],
    ['El peso se actualiza desde tu historial de medidas.', 'Weight is updated from your measurement history.'],
    ['Sin peso registrado', 'No weight recorded'],
    ['Registrar o actualizar peso', 'Log or update weight'],
    ['Guardar datos', 'Save personal information'],
    ['Guardando datos', 'Saving personal information'],
    ['Datos personales guardados.', 'Personal information saved.'],
    ['La altura debe estar entre 100 y 250 cm.', 'Height must be between 100 and 250 cm.'],
    ['La fecha debe ser válida y corresponder a una edad entre 18 y 100 años.', 'Enter a valid date for an age between 18 and 100.'],
    ['Selecciona un género válido.', 'Select a valid gender.'],
    ['No se pudieron guardar los datos personales.', 'Could not save personal information.'],
  ])('translates personal-data copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Medidas corporales', 'Body measurements'],
    ['Peso, composición y perímetros', 'Weight, composition, and circumferences'],
    ['Registrar', 'Log measurement'],
    ['Sin medidas registradas', 'No measurements logged'],
    ['Registra tu peso y medidas para ver tu evolución', 'Log your weight and measurements to see your progress'],
    ['Primera medida', 'First measurement'],
    ['Última medida · {date}', 'Latest measurement · {date}'],
    ['Grasa corporal', 'Body fat'],
    ['Masa muscular', 'Muscle mass'],
    ['Cintura', 'Waist'],
    ['vs. anterior', 'vs. previous'],
    ['Sin cambio', 'No change'],
    ['Evolución del peso', 'Weight progress'],
    ['Registra al menos 2 medidas para ver la gráfica', 'Log at least 2 measurements to see the chart'],
    ['Registrar medidas', 'Log measurements'],
    ['Editar medida', 'Edit measurement'],
    ['Más perímetros', 'More circumferences'],
    ['Menos campos', 'Fewer fields'],
    ['Notas opcionales…', 'Optional notes…'],
    ['¿Eliminar esta medida?', 'Delete this measurement?'],
    ['Medida eliminada.', 'Measurement deleted.'],
    ['No se pudo eliminar la medida.', 'Could not delete the measurement.'],
    ['Identificador de medida inválido.', 'Invalid measurement identifier.'],
    ['Medida guardada.', 'Measurement saved.'],
    ['Medida actualizada.', 'Measurement updated.'],
    ['{value} kg masa muscular', '{value} kg muscle mass'],
  ])('translates measurements copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Archivar', 'Archive'],
    ['El plan se archivará, pero tu historial permanecerá intacto.', 'The plan will be archived, but your history will remain intact.'],
    ['No se puede cambiar a Free', 'Cannot switch to Free'],
    ['Archiva planes hasta dejar como máximo dos familias vigentes e intenta nuevamente.', 'Archive plans until no more than two current families remain, then try again.'],
    ['Cambio de plan en curso', 'Plan change in progress'],
    ['Hay otra operación actualizando esta cuenta. Intenta nuevamente en unos segundos.', 'Another operation is updating this account. Try again in a few seconds.'],
  ])('translates plan retirement copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Ajustar plan', 'Adjust plan'],
    ['Días por semana', 'Days per week'],
    ['Equipamiento no disponible', 'Unavailable equipment'],
    ['Vista previa del ajuste', 'Adjustment preview'],
    ['Aplicar ajuste', 'Apply adjustment'],
    ['El motor recalculará y validará el plan completo antes de aplicar el cambio.', 'The engine will recalculate and validate the complete plan before applying the change.'],
  ])('translates structured plan adjustment copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Ritmo de entrenamiento', 'Training rhythm'],
    ['Días este mes', 'Days this month'],
    ['Racha actual', 'Current streak'],
    ['Actividad del mes', 'Monthly activity'],
    ['Día seleccionado', 'Selected day'],
    ['Resumen anual', 'Year overview'],
    ['Evidencia acumulada', 'Accumulated evidence'],
    ['Tu progreso tiene dirección', 'Your progress has direction'],
    ['Sin comparación', 'No comparison'],
    ['Ejercicios destacados', 'Highlighted exercises'],
    ['Registro cronológico', 'Chronological log'],
    ['Hitos recientes', 'Recent milestones'],
    ['Debrief de entrenamiento', 'Workout debrief'],
    ['Secuencia de la sesión', 'Session sequence'],
    ['Series completadas', 'Completed sets'],
    ['Mostrar series', 'Show sets'],
    ['Pasaporte del movimiento', 'Movement passport'],
    ['Evolución de fuerza', 'Strength progression'],
    ['Último estímulo', 'Latest stimulus'],
    ['Mostrar instrucciones', 'Show instructions'],
    ['Reintentar', 'Try again'],
  ])('translates training evidence copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Tu perfil', 'Your profile'],
    ['Foto, nombre e identidad', 'Photo, name, and identity'],
    ['Edad, género y altura', 'Age, gender, and height'],
    ['Peso, perímetros y evolución', 'Weight, measurements, and progress'],
    ['Tu entrenamiento', 'Your training'],
    ['Objetivo, agenda y equipo', 'Goal, schedule, and equipment'],
    ['Aplicación', 'Application'],
    ['Recordatorios y avisos', 'Reminders and alerts'],
    ['Idioma de la interfaz', 'Interface language'],
    ['Acceso y seguridad', 'Access and security'],
    ['Sesión, documentos y eliminación', 'Session, documents, and deletion'],
    ['Gestión de la aplicación', 'Application management'],
  ])('translates grouped settings overview copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Integración musical', 'Music integration'],
    ['Reproductor del sistema Android', 'Android system player'],
    ['Acceso del sistema', 'System access'],
    ['Controla la sesión multimedia activa de Android desde Vekira.', 'Control the active Android media session from Vekira.'],
    ['Consultando Android…', 'Checking Android…'],
    ['Disponible solo en la app Android', 'Available only in the Android app'],
    ['Esta integración necesita la aplicación de Vekira para Android.', 'This integration requires the Vekira Android app.'],
    ['Acceso pendiente en Android', 'Access pending in Android'],
    ['Android concede acceso amplio a las notificaciones.', 'Android grants broad notification access.'],
    ['Vekira solo consulta sesiones multimedia y no lee ni almacena el contenido de tus notificaciones.', 'Vekira only checks media sessions and does not read or store the content of your notifications.'],
    ['Habilitar en Android', 'Enable in Android'],
    ['Conectado · esperando música', 'Connected · waiting for music'],
    ['Integración activa', 'Integration active'],
    ['Gestionar en Android', 'Manage in Android'],
    ['No se pudo consultar Android', 'Could not check Android'],
    ['Abrir ajustes de Android', 'Open Android settings'],
    ['Abriendo Android…', 'Opening Android…'],
    ['No se pudieron abrir los ajustes de Android.', 'Could not open Android settings.'],
    ['Artista desconocido', 'Unknown artist'],
    ['Pausar {title}', 'Pause {title}'],
    ['Reproducir {title}', 'Play {title}'],
    ['Posición de {title}', 'Position in {title}'],
    ['{position} de {duration}', '{position} of {duration}'],
    ['No se pudo controlar la reproducción.', 'Could not control playback.'],
    ['No se pudo detectar la reproducción actual.', 'Could not detect current playback.'],
  ])('translates Android music integration copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Recordatorios de entrenamiento', 'Workout reminders'],
    ['Notificación local en tus días preferidos', 'Local notifications on your preferred days'],
    ['Avisos de Vekira', 'Vekira alerts'],
    ['Notificaciones profesionales', 'Professional notifications'],
    ['Lunes', 'Monday'],
    ['Lun', 'Mon'],
    ['Quitar aviso del plan', 'Remove plan notice'],
    ['Quitar notificación', 'Remove notification'],
    ['Quitar aviso de revisión del perfil', 'Remove profile review notice'],
    ['Quitar promoción', 'Remove promotion'],
    ['Aviso quitado.', 'Notice removed.'],
    ['No se pudo quitar el aviso.', 'Could not remove the notice.'],
    ['No se pudo quitar la notificación.', 'Could not remove the notification.'],
    ['Aviso no válido.', 'Invalid notice.'],
    ['El aviso ya no corresponde a tu estado actual.', 'This notice no longer matches your current status.'],
    ['Aviso no valido.', 'Invalid notice.'],
    ['Sesion no valida.', 'Invalid session.'],
    ['No se pudo comprobar el aviso.', 'Could not verify the notice.'],
    ['El aviso ya no corresponde al plan actual.', 'This notice no longer matches the current plan.'],
  ])('translates notification preference copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Identidad', 'Identity'],
    ['Así te reconoce Vekira en tu cuenta.', 'This is how Vekira recognizes you in your account.'],
    ['Sin nombre', 'No name'],
    ['Perfil en Comunidad', 'Community profile'],
    ['Cambiar foto', 'Change photo'],
    ['Quitar foto', 'Remove photo'],
  ])('translates profile settings identity copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['Cuenta de acceso', 'Access account'],
    ['Sesión', 'Session'],
    ['Documentos', 'Documents'],
    ['Zona peligrosa', 'Danger zone'],
    ['Interfaz en español', 'Interface in Spanish'],
    ['Interfaz en inglés', 'Interface in English'],
  ])('translates language and account settings copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['El nombre no puede superar 100 caracteres.', 'Name cannot exceed 100 characters.'],
    ['Sesión no válida.', 'Invalid session.'],
    ['No se pudo guardar el nombre.', 'Could not save the name.'],
    ['Nombre actualizado.', 'Name updated.'],
    ['No se recibió ninguna imagen.', 'No image was received.'],
    ['El archivo debe ser una imagen.', 'The file must be an image.'],
    ['El archivo está vacío.', 'The file is empty.'],
    ['La imagen supera el tamaño máximo (5 MB).', 'The image exceeds the maximum size (5 MB).'],
    ['No se pudo subir la imagen.', 'Could not upload the image.'],
    ['No se pudo guardar el avatar.', 'Could not save the avatar.'],
  ])('translates profile name and avatar action results: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })

  it.each([
    ['No se pudo preparar la sesión. Inténtalo nuevamente.', 'The session could not be prepared. Try again.'],
    ['No se pudo respaldar la sesión. Libera espacio y vuelve a intentar.', 'The session could not be backed up. Free some space and try again.'],
    ['Preparando sesión…', 'Preparing session…'],
    ['No se pudo preparar la sesión.', 'The session could not be prepared.'],
    ['Reintentar autorización', 'Retry authorization'],
    ['Esta rutina ya no está disponible en tu plan activo.', 'This workout is no longer available in your active plan.'],
    ['Esta rutina ya fue completada.', 'This workout has already been completed.'],
    ['Ya registraste una sesión hoy. Máximo una sesión por día.', 'You already logged a session today. Maximum one session per day.'],
    ['La autorización de esta sesión expiró. Inicia una nueva sesión.', 'This session authorization expired. Start a new session.'],
    ['No se pudo guardar la sesión. Inténtalo nuevamente.', 'The session could not be saved. Try again.'],
    ['No se pudo guardar la sesión', 'The session could not be saved'],
    ['No se pudo validar la autorización de esta sesión. Inicia una nueva sesión.', 'This session authorization could not be validated. Start a new session.'],
    ['La fecha de finalización de esta sesión no es válida.', 'This session completion date is invalid.'],
    ['Tu sesión expiró. Inicia sesión nuevamente.', 'Your session expired. Sign in again.'],
    ['No autenticado', 'Not authenticated'],
    ['Valores fuera de rango. Revisa peso (máx. 500 kg), reps (máx. 100) y RPE (1-10).', 'Values are out of range. Check weight (max. 500 kg), reps (max. 100), and RPE (1-10).'],
    ['Identificador de sesión inválido', 'Invalid session identifier'],
    ['Este identificador de sesión pertenece a otro entrenamiento.', 'This session identifier belongs to another workout.'],
    ['Esta rutina ya fue completada hoy.', 'This workout was already completed today.'],
    ['Esta rutina ya fue registrada desde su día programado.', 'This workout was already logged since its scheduled day.'],
    ['Solo puedes registrar la rutina de hoy o recuperar una sesión perdida reciente.', 'You can only log today\'s workout or recover a recent missed session.'],
    ['No se pudo reconstruir el resultado guardado de la sesión.', 'The saved session result could not be reconstructed.'],
  ])('translates durable session authorization copy: %s', (source, expected) => {
    expect(translate('en', source)).toBe(expected)
  })
})
