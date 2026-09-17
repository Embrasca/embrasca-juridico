const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(
  path.join(__dirname, 'premium-theme.css'),
  'utf8'
);

const themeJs = fs.readFileSync(
  path.join(__dirname, 'premium-theme.js'),
  'utf8'
);

const adminJs = fs.readFileSync(
  path.join(__dirname, 'admin-users-ui.js'),
  'utf8'
);

const index = fs.readFileSync(
  path.join(__dirname, 'index.html'),
  'utf8'
);

test(
  'application uses only the light theme',
  () => {
    assert.match(
      themeJs,
      /root\.dataset\.theme = ['"]light['"]/
    );

    assert.match(
      themeJs,
      /root\.style\.colorScheme = ['"]light['"]/
    );

    assert.doesNotMatch(
      themeJs,
      /prefers-color-scheme/
    );

    assert.doesNotMatch(
      themeJs,
      /embrasca-theme-toggle/
    );

    assert.doesNotMatch(
      css,
      /data-theme=["']dark["']/
    );
  }
);

test(
  'old saved theme preference is removed',
  () => {
    assert.match(
      themeJs,
      /localStorage\.removeItem\(['"]embrascaJuridicoTheme['"]\)/
    );
  }
);

test(
  'sidebar navigation owns a stable vertical layout',
  () => {
    assert.match(
      themeJs,
      /nav\.classList\.add\(['"]premium-nav['"]\)/
    );

    assert.match(
      css,
      /#nav\.premium-nav\{[^}]*display:flex[^}]*flex-direction:column[^}]*align-items:stretch/s
    );
  }
);

test(
  'theme toggle was completely removed',
  () => {
    assert.doesNotMatch(
      themeJs,
      /premium-sidebar-shell/
    );

    assert.doesNotMatch(
      css,
      /premium-sidebar-shell/
    );

    assert.doesNotMatch(
      css,
      /embrasca-theme-toggle/
    );
  }
);

test(
  'light theme exposes the complete surface token system',
  () => {
    assert.match(
      css,
      /--sidebar:/
    );

    assert.match(
      css,
      /--topbar:/
    );

    assert.match(
      css,
      /--modal:/
    );

    assert.match(
      css,
      /--control:/
    );

    assert.match(
      css,
      /color-scheme:light/
    );
  }
);

test(
  'admin modal uses theme tokens instead of hard-coded panel colors',
  () => {
    assert.match(
      adminJs,
      /var\(--modal\)/
    );

    assert.match(
      adminJs,
      /var\(--control\)/
    );

    assert.doesNotMatch(
      adminJs,
      /background:#f7f9f7/
    );

    assert.doesNotMatch(
      adminJs,
      /font-family:Arial/
    );
  }
);

test(
  'admin actions are laid out predictably and never overlap',
  () => {
    assert.match(
      adminJs,
      /\.adm-actions\{[^}]*display:grid/
    );

    assert.match(
      adminJs,
      /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/
    );

    assert.match(
      adminJs,
      /white-space:nowrap/
    );

    assert.match(
      adminJs,
      /@media\(max-width:760px\)/
    );
  }
);

test(
  'premium assets use the light-only cache revision',
  () => {
    assert.match(
      index,
      /premium-theme\.css\?v=20260917-light-only/
    );

    assert.match(
      index,
      /premium-theme\.js\?v=20260917-light-only/
    );
  }
);