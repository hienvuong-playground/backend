const fs = require('fs');
const path = require('path');

const SECRETS_DIR = process.env.SECRETS_DIR || '/mnt/secrets-store';

function readSecret(name) {
  try {
    return fs.readFileSync(path.join(SECRETS_DIR, name), 'utf8').trim();
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (process.env[name] === undefined) {
    throw new Error(`secret ${name} not found in ${SECRETS_DIR} or env`);
  }
  return process.env[name];
}

module.exports = { readSecret };
