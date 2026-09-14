import QrScanner from 'qr-scanner'
import { createWorker } from 'qr-scanner/qr-scanner-worker.min.js'

// Android's BarcodeDetector can advertise QR support but return only empty
// results when its downloaded model is unavailable. Both camera and image
// scanning must use the decoder bundled in the app, including while offline.
// This public factory is shared by the library's constructor and scanImage.
QrScanner.createQrEngine = async () => createWorker()

export default QrScanner
