(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EmbrascaLocationDropdowns = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CACHE_PREFIX = 'embrasca-juridico:municipios:';
  const CACHE_SUFFIX = ':ibge';
  const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';

  const STATES = [
    { id: 12, uf: 'AC', name: 'Acre' },
    { id: 27, uf: 'AL', name: 'Alagoas' },
    { id: 16, uf: 'AP', name: 'Amapá' },
    { id: 13, uf: 'AM', name: 'Amazonas' },
    { id: 29, uf: 'BA', name: 'Bahia' },
    { id: 23, uf: 'CE', name: 'Ceará' },
    { id: 53, uf: 'DF', name: 'Distrito Federal' },
    { id: 32, uf: 'ES', name: 'Espírito Santo' },
    { id: 52, uf: 'GO', name: 'Goiás' },
    { id: 21, uf: 'MA', name: 'Maranhão' },
    { id: 51, uf: 'MT', name: 'Mato Grosso' },
    { id: 50, uf: 'MS', name: 'Mato Grosso do Sul' },
    { id: 31, uf: 'MG', name: 'Minas Gerais' },
    { id: 15, uf: 'PA', name: 'Pará' },
    { id: 25, uf: 'PB', name: 'Paraíba' },
    { id: 41, uf: 'PR', name: 'Paraná' },
    { id: 26, uf: 'PE', name: 'Pernambuco' },
    { id: 22, uf: 'PI', name: 'Piauí' },
    { id: 33, uf: 'RJ', name: 'Rio de Janeiro' },
    { id: 24, uf: 'RN', name: 'Rio Grande do Norte' },
    { id: 43, uf: 'RS', name: 'Rio Grande do Sul' },
    { id: 11, uf: 'RO', name: 'Rondônia' },
    { id: 14, uf: 'RR', name: 'Roraima' },
    { id: 42, uf: 'SC', name: 'Santa Catarina' },
    { id: 35, uf: 'SP', name: 'São Paulo' },
    { id: 28, uf: 'SE', name: 'Sergipe' },
    { id: 17, uf: 'TO', name: 'Tocantins' },
  ];

  function normalize(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function isLocationField(field) {
    const text = normalize(`${field && field.name ? field.name : ''} ${field && field.placeholder ? field.placeholder : ''}`);
    return /(^|[^a-z])(municipio|cidade)([^a-z]|$)/.test(text);
  }

  function deriveStateLabel(label) {
    const text = String(label || '').trim();
    if (!text) return 'Estado';
    if (/munic[ií]pio/i.test(text)) return text.replace(/munic[ií]pio/i, 'Estado');
    if (/cidade/i.test(text)) return text.replace(/cidade/i, 'Estado');
    return `Estado - ${text}`;
  }

  function findState(uf) {
    const value = String(uf || '').trim().toUpperCase();
    return STATES.find((state) => state.uf === value) || null;
  }

  function cacheKey(uf) {
    return `${CACHE_PREFIX}${String(uf || '').toUpperCase()}${CACHE_SUFFIX}`;
  }

  async function loadMunicipalities(uf, fetchImpl, storage) {
    const state = findState(uf);
    if (!state) throw new Error('Estado inválido.');

    const key = cacheKey(state.uf);
    if (storage && typeof storage.getItem === 'function') {
      try {
        const cached = storage.getItem(key);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
            return parsed;
          }
        }
      } catch (_) {
        // Cache inválido não impede nova consulta ao IBGE.
      }
    }

    if (typeof fetchImpl !== 'function') throw new Error('Serviço de localidades indisponível.');
    const url = `${IBGE_BASE}/estados/${state.id}/municipios?orderBy=nome`;
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response || !response.ok) throw new Error('Não foi possível carregar os municípios do IBGE.');

    const payload = await response.json();
    const cities = (Array.isArray(payload) ? payload : [])
      .map((item) => String(item && item.nome ? item.nome : '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (!cities.length) throw new Error('O IBGE não retornou municípios para o estado selecionado.');

    if (storage && typeof storage.setItem === 'function') {
      try {
        storage.setItem(key, JSON.stringify(cities));
      } catch (_) {
        // O dropdown continua funcionando mesmo se o navegador bloquear o cache local.
      }
    }

    return cities;
  }

  function option(doc, value, text) {
    const element = doc.createElement('option');
    element.value = value;
    element.textContent = text;
    return element;
  }

  function createStateControl(doc, field, originalInput, container) {
    const stateField = doc.createElement(container && container.tagName ? container.tagName.toLowerCase() : 'div');
    stateField.className = container && container.className ? container.className : '';
    stateField.removeAttribute('id');
    stateField.dataset.locationStateFor = field.placeholder;

    const label = doc.createElement('label');
    label.htmlFor = `uf_${field.placeholder}`;
    label.textContent = deriveStateLabel(field.name || 'Município');

    const select = doc.createElement('select');
    select.id = `uf_${field.placeholder}`;
    select.className = originalInput.className || '';
    if (originalInput.style && originalInput.style.cssText) select.style.cssText = originalInput.style.cssText;
    select.dataset.locationState = field.placeholder;
    select.appendChild(option(doc, '', 'Selecione o estado'));

    STATES.slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .forEach((state) => select.appendChild(option(doc, state.uf, `${state.name} (${state.uf})`)));

    stateField.appendChild(label);
    stateField.appendChild(select);
    return { stateField, stateSelect: select };
  }

  function createCitySelect(doc, field, originalInput) {
    const select = doc.createElement('select');
    select.id = originalInput.id;
    select.name = originalInput.name || '';
    select.className = originalInput.className || '';
    if (originalInput.style && originalInput.style.cssText) select.style.cssText = originalInput.style.cssText;
    select.required = Boolean(originalInput.required || field.required);
    select.dataset.locationCity = field.placeholder;

    const currentValue = String(originalInput.value || '').trim();
    if (currentValue) {
      select.appendChild(option(doc, currentValue, currentValue));
      select.value = currentValue;
      select.disabled = false;
    } else {
      select.appendChild(option(doc, '', 'Selecione primeiro o estado'));
      select.disabled = true;
    }
    return select;
  }

  function fillCitySelect(doc, citySelect, cities, selectedValue) {
    const previous = String(selectedValue || '').trim();
    citySelect.innerHTML = '';
    citySelect.appendChild(option(doc, '', 'Selecione a cidade'));
    cities.forEach((city) => citySelect.appendChild(option(doc, city, city)));
    citySelect.disabled = false;
    if (previous && cities.includes(previous)) citySelect.value = previous;
  }

  function enhanceLocationFields(doc, profileFields, fetchImpl, storage) {
    if (!doc || !Array.isArray(profileFields)) return 0;
    let count = 0;

    profileFields.filter((field) => field && !field.hidden && isLocationField(field)).forEach((field) => {
      const originalInput = doc.getElementById(`f_${field.placeholder}`);
      if (!originalInput || originalInput.dataset.locationEnhanced === 'true') return;

      const container = originalInput.closest ? (originalInput.closest('.field') || originalInput.parentElement) : originalInput.parentElement;
      if (!container || !container.parentElement) return;

      const currentValue = String(originalInput.value || '').trim();
      const { stateField, stateSelect } = createStateControl(doc, field, originalInput, container);
      const citySelect = createCitySelect(doc, field, originalInput);
      citySelect.dataset.locationEnhanced = 'true';

      container.parentElement.insertBefore(stateField, container);
      originalInput.replaceWith(citySelect);

      stateSelect.addEventListener('change', async () => {
        const uf = stateSelect.value;
        citySelect.innerHTML = '';
        if (!uf) {
          citySelect.appendChild(option(doc, '', 'Selecione primeiro o estado'));
          citySelect.disabled = true;
          return;
        }

        citySelect.appendChild(option(doc, '', 'Carregando cidades...'));
        citySelect.disabled = true;

        try {
          const cities = await loadMunicipalities(uf, fetchImpl, storage);
          fillCitySelect(doc, citySelect, cities, currentValue);
        } catch (error) {
          citySelect.innerHTML = '';
          citySelect.appendChild(option(doc, '', 'Não foi possível carregar as cidades'));
          citySelect.disabled = true;
          console.error('[EMBRASCA JURÍDICO] Falha ao carregar municípios:', error);
        }
      });

      count += 1;
    });

    return count;
  }

  function installBrowserPatch() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return false;
    if (typeof fields !== 'function') return false;
    if (window.__EMBRASCA_LOCATION_DROPDOWNS__) return true;

    const previousFields = fields;
    fields = function (pref = {}) {
      previousFields(pref);
      try {
        const profile = typeof prof === 'function' ? prof(T) : null;
        const profileFields = profile && Array.isArray(profile.fields) ? profile.fields : [];
        enhanceLocationFields(
          document,
          profileFields,
          typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
          window.localStorage,
        );
      } catch (error) {
        console.error('[EMBRASCA JURÍDICO] Falha ao preparar dropdowns de localidade:', error);
      }
    };

    window.__EMBRASCA_LOCATION_DROPDOWNS__ = true;
    return true;
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    installBrowserPatch();
  }

  return {
    STATES,
    cacheKey,
    deriveStateLabel,
    enhanceLocationFields,
    findState,
    isLocationField,
    loadMunicipalities,
  };
});
