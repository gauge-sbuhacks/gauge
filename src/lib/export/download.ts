// save a blob as a file in the browser

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // give the browser a moment to start the download before freeing the url
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFilename(ext: string, suffix = 'inventory'): string {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `gauge-${suffix}-${stamp}.${ext}`;
}
