import { Capacitor } from '@capacitor/core'

export async function shareBackup(json: string) {
  const filename = `vekira-respaldo-${new Date().toISOString().slice(0, 10)}.json`
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
    const file = await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'Respaldo de Vekira', files: [file.uri], dialogTitle: 'Guardar respaldo' })
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
