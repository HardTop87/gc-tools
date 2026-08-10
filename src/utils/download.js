// Browser-Download mit sauberer Freigabe der Object-URL (Bug-Hunt B8).
// Eine Implementierung für alle Seiten — vorher gab es drei Kopien mit drei
// verschiedenen Freigabe-Verhalten (Verwaltung, PayPal-Export, Post-Manager).
// Die Freigabe passiert verzögert, weil einige Browser (Safari) den Download
// abbrechen, wenn die URL direkt nach dem Klick widerrufen wird. `delayMs`
// staffelt mehrere Downloads hintereinander, statt sie gleichzeitig zu feuern.
export function downloadBlobFile(filename, blob, { delayMs = 0 } = {}) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  setTimeout(() => {
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, delayMs);
}

export function downloadTextFile(filename, mime, content, opts) {
  downloadBlobFile(filename, new Blob([content], { type: mime }), opts);
}
