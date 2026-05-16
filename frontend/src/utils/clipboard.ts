export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0'; ta.style.left = '0';
    ta.style.opacity = '0'; ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    const prevSel = document.getSelection();
    const prevRange = prevSel && prevSel.rangeCount > 0 ? prevSel.getRangeAt(0) : null;
    ta.focus(); ta.select(); ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    if (prevRange && prevSel) { prevSel.removeAllRanges(); prevSel.addRange(prevRange); }
    return ok;
  } catch { return false; }
}
