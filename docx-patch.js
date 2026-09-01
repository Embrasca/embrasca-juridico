(() => {
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  async function generateDocxOnServer(d) {
    const p = prof(d.templateCode);
    const templateBase64 = BUILTIN_TEMPLATES[d.templateCode];
    if (!templateBase64) throw new Error('Modelo interno não encontrado.');

    const response = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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

    downloadBytes(bytes, fileName(d), DOCX_MIME);
  }

  downloadDoc = async function(d) {
    try {
      await generateDocxOnServer(d);
    } catch (error) {
      console.error('[DOCX]', error);
      toast('Falha ao gerar o DOCX: ' + (error && error.message ? error.message : 'erro desconhecido'));
    }
  };

  window.__EMBRASCA_DOCX_FIX__ = true;
})();
