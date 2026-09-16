(() => {
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  function forceDocxFileName(d) {
    let suggestedName = 'documento';

    try {
      if (typeof fileName === 'function') {
        suggestedName = fileName(d) || suggestedName;
      }
    } catch (_) {}

    suggestedName = String(suggestedName).trim() || 'documento';
    suggestedName = suggestedName.split(/[\\/]/).pop() || 'documento';

    if (/\.docx$/i.test(suggestedName)) return suggestedName;

    suggestedName = suggestedName.replace(/\.[^.\\/]+$/, '');
    return `${suggestedName || 'documento'}.docx`;
  }

  function downloadDocxBytes(bytes, d) {
    const blob = new Blob([bytes], { type: DOCX_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = forceDocxFileName(d);
    anchor.rel = 'noopener';
    anchor.style.display = 'none';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function generateDocxOnServer(d) {
    const p = prof(d.templateCode);
    const templateBase64 = BUILTIN_TEMPLATES[d.templateCode];
    if (!templateBase64) throw new Error('Modelo interno não encontrado.');

    const response = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateCode: d.templateCode,
        templateBase64,
        replacements: valuesForDoc(p, d.values, d.version, d.status)
      })
    });

    if (!response.ok) {
      let message = 'Falha ao gerar o arquivo DOCX.';
      try {
        const problem = await response.json();
        if (problem && problem.error) message = problem.error;
      } catch (_) {}
      throw new Error(message);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      throw new Error('O servidor retornou um arquivo DOCX inválido.');
    }

    downloadDocxBytes(bytes, d);
  }

  async function persistAndDownload(d) {
    const workspace = window.EmbrascaLegalWorkspace;
    if (!workspace?.persistGeneratedDocument || !workspace?.downloadVersion) return false;

    const p = prof(d.templateCode);
    const templateBase64 = BUILTIN_TEMPLATES[d.templateCode];
    if (!templateBase64) throw new Error('Modelo interno não encontrado.');

    const document = await workspace.persistGeneratedDocument({
      legacyDocument: d,
      templateBase64,
      replacements: valuesForDoc(p, d.values, d.version, d.status),
    });

    await workspace.downloadVersion(document.id, document.currentVersion);
    return true;
  }

  downloadDoc = async function(d) {
    try {
      const centralized = await persistAndDownload(d);
      if (!centralized) await generateDocxOnServer(d);
    } catch (error) {
      console.error('[DOCX]', error);
      toast('Falha ao gerar o DOCX: ' + (error && error.message ? error.message : 'erro desconhecido'));
    }
  };

  window.__EMBRASCA_DOCX_FIX__ = true;
})();
