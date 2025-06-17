const crypto = require('crypto');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

console.log('Testing password hashes:');
console.log('password:', hashPassword('password'));
console.log('password123:', hashPassword('password123'));
