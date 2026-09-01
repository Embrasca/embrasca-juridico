(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EmbrascaTask2Core = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function digits(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function documentType(code) {
    const value = String(code || '');
    if (value.startsWith('MINUTA_')) return 'MINUTA';
    if (value.startsWith('NDA_')) return 'NDA';
    if (value.startsWith('MOU_')) return 'MOU';
    return null;
  }

  function isValidCPF(value) {
    const cpf = digits(value);
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    const calc = (length) => {
      let sum = 0;
      for (let i = 0; i < length; i += 1) sum += Number(cpf[i]) * (length + 1 - i);
      const mod = (sum * 10) % 11;
      return mod === 10 ? 0 : mod;
    };
    return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
  }

  function isValidCNPJ(value) {
    const cnpj = digits(value);
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    const calc = (baseLength) => {
      const weights = baseLength === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
      const sum = weights.reduce((total, weight, index) => total + Number(cnpj[index]) * weight, 0);
      const rem = sum % 11;
      return rem < 2 ? 0 : 11 - rem;
    };
    return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function isValidPercentage(value) {
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 100;
  }

  function validateField(field, value) {
    const text = String(value == null ? '' : value).trim();
    if (field.required && !text) return `${field.name} é obrigatório.`;
    if (!text) return null;
    if (field.field_type === 'cpf' && !isValidCPF(text)) return `${field.name}: CPF inválido.`;
    if (field.field_type === 'cnpj' && !isValidCNPJ(text)) return `${field.name}: CNPJ inválido.`;
    if (field.field_type === 'email' && !isValidEmail(text)) return `${field.name}: e-mail inválido.`;
    if (field.placeholder === 'percentual_remuneracao' && !isValidPercentage(text)) return `${field.name}: informe um valor entre 0 e 100.`;
    if (field.field_type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${field.name}: data inválida.`;
    return null;
  }

  return { documentType, isValidCPF, isValidCNPJ, isValidEmail, isValidPercentage, validateField };
});
