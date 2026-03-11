#!/usr/bin/env node

// Copyright (c) 2025 AgentSpan
// Licensed under the MIT License. See LICENSE file in the project root for details.


const https = require('https');
const fs = require('fs');
const path = require('path');

const S3_BUCKET = 'https://agentspan.s3.us-east-2.amazonaws.com';
const BINARY_NAME = 'agentspan';

// Detect platform and architecture
function getPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  const platformMap = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'windows'
  };

  const archMap = {
    x64: 'amd64',
    arm64: 'arm64'
  };

  if (!platformMap[platform]) {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }

  if (!archMap[arch]) {
    console.error(`Unsupported architecture: ${arch}`);
    process.exit(1);
  }

  return {
    os: platformMap[platform],
    arch: archMap[arch],
    isWindows: platform === 'win32'
  };
}

// Download binary following redirects
function downloadBinary(url, dest) {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl) => {
      const mod = requestUrl.startsWith('https') ? https : require('http');
      mod.get(requestUrl, { headers: { 'User-Agent': 'agentspan-npm-installer' } }, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          makeRequest(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });

        file.on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
      }).on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    };

    makeRequest(url);
  });
}

async function install() {
  try {
    console.log('Installing AgentSpan CLI...');

    const { os, arch, isWindows } = getPlatform();
    console.log(`Platform: ${os} ${arch}`);

    const binaryName = isWindows ? `${BINARY_NAME}.exe` : BINARY_NAME;
    const downloadName = isWindows ? `${BINARY_NAME}_${os}_${arch}.exe` : `${BINARY_NAME}_${os}_${arch}`;
    const downloadUrl = `${S3_BUCKET}/cli/latest/${downloadName}`;

    console.log(`Downloading from: ${downloadUrl}`);

    // Create bin directory
    const binDir = path.join(__dirname, 'bin');
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    // Download binary
    const binaryPath = path.join(binDir, binaryName);
    await downloadBinary(downloadUrl, binaryPath);

    // Make executable (Unix-like systems)
    if (!isWindows) {
      fs.chmodSync(binaryPath, 0o755);
    }

    console.log('Installation successful!');
    console.log(`Binary installed at: ${binaryPath}`);
    console.log(`\nRun 'agentspan --help' to get started.`);
  } catch (error) {
    console.error('Installation failed:', error.message);
    process.exit(1);
  }
}

install();
