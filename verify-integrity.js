const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const EXPECTED_HASHES = {
    'ol.js': 'u+OabxywjjSbE8bk5/vzOJr/EjSmmSMXZyO23SBE3nKt3fQHO2Y/GDD30ovgAGLi',
    'ol-layerswitcher.js': 'rzmK1JrrlJNUgG9Kgq6gqwP22n7S7IyDdif/eTuEc8QiG/QGTgerkxHjzJbtr9GN'
};

function calculateHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha384');
    hashSum.update(fileBuffer);
    return hashSum.digest('base64');
}

function verifyFiles() {
    const vendorDir = path.join(__dirname, 'vendor', 'openlayers');
    let allValid = true;

    for (const [filename, expectedHash] of Object.entries(EXPECTED_HASHES)) {
        const filePath = path.join(vendorDir, filename);
        try {
            const actualHash = calculateHash(filePath);
            if (actualHash === expectedHash) {
                console.log(`✅ ${filename} integrity verified`);
            } else {
                console.error(`❌ ${filename} integrity check failed`);
                console.error(`Expected: ${expectedHash}`);
                console.error(`Actual:   ${actualHash}`);
                allValid = false;
            }
        } catch (error) {
            console.error(`❌ Error checking ${filename}:`, error.message);
            allValid = false;
        }
    }

    return allValid;
}

if (verifyFiles()) {
    console.log('\nAll files verified successfully!');
    process.exit(0);
} else {
    console.error('\nSome files failed verification. Please re-download the files.');
    process.exit(1);
} 