import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
	chmod,
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import axios from 'axios';
import { getProxyForUrl } from 'proxy-from-env';
import * as tar from 'tar';

const configuredBaseUrls = (
	process.env.MEDIASOUP_WORKER_PREBUILT_DOWNLOAD_BASE_URL || ''
)
	.split(',')
	.map(value => value.trim().replace(/\/+$/, ''))
	.filter(Boolean);

if (configuredBaseUrls.length === 0) {
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

const localArchiveDirectory = process.env.MEDIASOUP_WORKER_LOCAL_ARCHIVE_DIR
	? path.resolve(process.env.MEDIASOUP_WORKER_LOCAL_ARCHIVE_DIR)
	: null;
const configuredCacheDirectory = process.env.MEDIASOUP_WORKER_CACHE_DIR
	? path.resolve(process.env.MEDIASOUP_WORKER_CACHE_DIR)
	: null;
const cacheDirectory =
	configuredCacheDirectory ||
	(await mkdtemp(path.join(tmpdir(), 'aquar-mediasoup-cache-')));
const removeCacheDirectory = !configuredCacheDirectory;
const downloadDirectory = await mkdtemp(
	path.join(tmpdir(), 'aquar-mediasoup-download-')
);
const cachedArchivePath = path.join(cacheDirectory, workerName);
const localArchivePath = localArchiveDirectory
	? path.join(localArchiveDirectory, workerName)
	: null;

async function fileExists(filePath) {
	try {
		await stat(filePath);

		return true;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
}

function getAxiosProxy(workerUrl) {
	const proxyUrl = getProxyForUrl(workerUrl);

	if (!proxyUrl) {
		return false;
	}

	const parsedProxyUrl = new URL(proxyUrl);

	if (!['http:', 'https:'].includes(parsedProxyUrl.protocol)) {
		throw new Error(
			`unsupported proxy protocol for worker download: ${parsedProxyUrl.protocol}`
		);
	}

	console.log(`使用下载代理：${parsedProxyUrl.protocol}//${parsedProxyUrl.host}`);

	return {
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
}

async function downloadArchive(workerUrl, archivePath) {
	const response = await axios.get(workerUrl, {
		maxBodyLength: 64 * 1024 * 1024,
		maxContentLength: 64 * 1024 * 1024,
		proxy: getAxiosProxy(workerUrl),
		responseType: 'arraybuffer',
		timeout: 30_000,
	});

	await writeFile(archivePath, response.data);
}

async function installArchive(archivePath) {
	await mkdir(workerDirectory, { recursive: true });
	await rm(workerPath, { force: true });
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
}

let installedFrom = null;

try {
	await mkdir(cacheDirectory, { recursive: true });

	if (localArchivePath && (await fileExists(localArchivePath))) {
		console.log(`使用 scripts 中的本地 worker：${localArchivePath}`);

		try {
			await installArchive(localArchivePath);
			if (path.resolve(localArchivePath) !== path.resolve(cachedArchivePath)) {
				await copyFile(localArchivePath, cachedArchivePath);
			}
			installedFrom = localArchivePath;
		} catch (error) {
			console.warn(`本地 worker 无效，将尝试其他来源：${error.message}`);
			await rm(cachedArchivePath, { force: true });
		}
	}

	if (!installedFrom && (await fileExists(cachedArchivePath))) {
		console.log(`使用 Docker 本地缓存的 worker：${cachedArchivePath}`);

		try {
			await installArchive(cachedArchivePath);
			installedFrom = cachedArchivePath;
		} catch (error) {
			console.warn(`Docker worker 缓存无效，将重新下载：${error.message}`);
			await rm(cachedArchivePath, { force: true });
		}
	}

	if (!installedFrom) {
		const failures = [];

		for (const [index, baseUrl] of configuredBaseUrls.entries()) {
			const workerUrl = `${baseUrl}/${workerVersion}/${workerName}`;
			const downloadPath = path.join(
				downloadDirectory,
				`${workerName}.${index}`
			);

			try {
				console.log(`下载 mediasoup 预编译 worker：${workerUrl}`);
				await downloadArchive(workerUrl, downloadPath);
				await installArchive(downloadPath);
				await copyFile(downloadPath, cachedArchivePath);
				installedFrom = workerUrl;
				break;
			} catch (error) {
				const reason = error?.message || String(error);
				failures.push(`${baseUrl}: ${reason}`);
				console.warn(`下载源不可用，切换下一个：${reason}`);
				await rm(downloadPath, { force: true });
			}
		}

		if (!installedFrom) {
			throw new Error(
				`所有 mediasoup worker 下载源均失败：\n${failures.join('\n')}`
			);
		}
	}

	console.log(`mediasoup worker 已就绪，来源：${installedFrom}`);
} finally {
	await rm(downloadDirectory, { recursive: true, force: true });
	if (removeCacheDirectory) {
		await rm(cacheDirectory, { recursive: true, force: true });
	}
}
