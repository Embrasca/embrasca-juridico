const AUTH_UNAVAILABLE_MESSAGE = 'Serviço de autenticação temporariamente indisponível. Tente novamente em alguns minutos.';

function textOf(data) {
  try {
    return JSON.stringify(data || {}).toLowerCase();
  } catch {
    return String(data || '').toLowerCase();
  }
}

function classifyLoginFailure(response) {
  const status = Number(response?.status || 0);
  const data = response?.data || {};
  const code = String(data.error_code || data.code || '').toLowerCase();
  const text = textOf(data);

  if (code === 'invalid_credentials' || /invalid login credentials|invalid credentials/.test(text)) {
    return { status: 401, error: 'E-mail ou senha inválidos.' };
  }

  if (
    status >= 500 ||
    status === 0 ||
    /project[^\n]*(paused|inactive|not active)|temporarily unavailable|service unavailable|upstream/.test(text)
  ) {
    return { status: 503, error: AUTH_UNAVAILABLE_MESSAGE };
  }

  if (status >= 200 && status < 300) {
    return { status: 503, error: AUTH_UNAVAILABLE_MESSAGE };
  }

  return { status: 401, error: 'E-mail ou senha inválidos.' };
}

module.exports = { AUTH_UNAVAILABLE_MESSAGE, classifyLoginFailure };
