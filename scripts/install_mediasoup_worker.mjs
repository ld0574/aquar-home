import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
	chmod,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import axios from 'axios';
import { getProxyForUrl } from 'proxy-from-env';
import * as tar from 'tar';

const baseUrl = process.env.MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL?.replace(
	/\/+$/,
	''
);

if (!baseUrl) {
	throw new Error(
		'MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL is required'
	);
}

if (process.platform !== 'linux') {
	throw new Error(`Expected a Linux builder, got ${process.platform}`);
}

const mediasoupRoot = path.resolve('node_modules/mediasoup');
const mediasoupPackage = JSON.parse(
	await readFile(path.join(mediasoupRoot, 'package.json'), 'utf8')
);
const workerVersion = mediasoupPackage.version;
const kernelMajor = os.release().split('.')[0];
const workerName = `mediasoup-worker-${workerVersion}-${process.platform}-${process.arch}-kernel${kernelMajor}.tgz`;
const workerDirectory = path.join(mediasoupRoot, 'worker', 'out', 'Release');
const workerPath = path.join(workerDirectory, 'mediasoup-worker');
const workerUrl = `${baseUrl}/${workerVersion}/${workerName}`;
const temporaryDirectory = await mkdtemp(
	path.join(tmpdir(), 'aquar-mediasoup-worker-')
);
const archivePath = path.join(temporaryDirectory, workerName);

try {
	console.log(`下载 mediasoup 预编译 worker：${workerUrl}`);

	const proxyUrl = getProxyForUrl(workerUrl);
	let proxy = false;

	if (proxyUrl) {
		const parsedProxyUrl = new URL(proxyUrl);

		if (!['http:', 'https:'].includes(parsedProxyUrl.protocol)) {
			throw new Error(
				`unsupported proxy protocol for worker download: ${parsedProxyUrl.protocol}`
			);
		}

		proxy = {
			protocol: parsedProxyUrl.protocol.slice(0, -1),
			host: parsedProxyUrl.hostname,
			port: Number(
				parsedProxyUrl.port ||
					(parsedProxyUrl.protocol === 'https:' ? 443 : 80)
			),
			...(parsedProxyUrl.username
				? {
					auth: {
						username: decodeURIComponent(parsedProxyUrl.username),
						password: decodeURIComponent(parsedProxyUrl.password),
					},
				}
				: {}),
		};
		console.log(`使用下载代理：${parsedProxyUrl.protocol}//${parsedProxyUrl.host}`);
	}

	const response = await axios.get(workerUrl, {
		maxBodyLength: 64 * 1024 * 1024,
		maxContentLength: 64 * 1024 * 1024,
		proxy,
		responseType: 'arraybuffer',
		timeout: 120_000,
	});

	await writeFile(archivePath, response.data);

	await mkdir(workerDirectory, { recursive: true });
	await tar.x({
		file: archivePath,
		cwd: workerDirectory,
		strict: true,
	});
	await chmod(workerPath, 0o755);

	const workerCheck = spawnSync(workerPath, {
		stdio: 'ignore',
		env: {},
	});

	if (workerCheck.error) {
		throw workerCheck.error;
	}

	if (workerCheck.status !== 41) {
		throw new Error(
			`mediasoup worker self-check failed: status=${workerCheck.status} signal=${workerCheck.signal}`
		);
	}

	console.log(`mediasoup worker 已就绪：${workerPath}`);
} finally {
	await rm(temporaryDirectory, { recursive: true, force: true });
}
