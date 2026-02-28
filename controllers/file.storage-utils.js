const fs = require('fs');
const File = require('../models/file.model');

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const USER_QUOTA = 500 * 1024 * 1024;
const GLOBAL_QUOTA = 9 * 1024 * 1024 * 1024;
const BUCKET = process.env.R2_BUCKET;
const LOCAL_FALLBACK_ENABLED = !process.env.VERCEL && process.env.ALLOW_LOCAL_STORAGE_FALLBACK !== 'false';

const NETWORK_ERROR_CODES = new Set(['ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ECONNABORTED']);
const NETWORK_ERROR_NAMES = new Set(['TimeoutError', 'AbortError']);

const isNetworkTimeoutError = (error) => {
	if (!error) return false;
	if (NETWORK_ERROR_CODES.has(error.code) || NETWORK_ERROR_NAMES.has(error.name)) return true;
	if (Array.isArray(error.errors) && error.errors.some((child) => isNetworkTimeoutError(child))) return true;
	if (error.cause && isNetworkTimeoutError(error.cause)) return true;
	return false;
};

const cleanupTempUploads = (files = [], preservePaths = new Set()) => {
	for (const file of files) {
		if (file?.path && preservePaths.has(file.path)) continue;
		if (file?.path && fs.existsSync(file.path)) {
			try {
				fs.unlinkSync(file.path);
			} catch (cleanupErr) {
				console.warn('Temp file cleanup warning:', cleanupErr.message);
			}
		}
	}
};

const formatStorage = (bytes) => {
	if (bytes < 1024) return { storageUsed: bytes.toFixed(2), storageUnit: 'B' };
	if (bytes < 1024 * 1024) return { storageUsed: (bytes / 1024).toFixed(2), storageUnit: 'KB' };
	if (bytes < 1024 * 1024 * 1024) return { storageUsed: (bytes / (1024 * 1024)).toFixed(2), storageUnit: 'MB' };
	return { storageUsed: (bytes / (1024 * 1024 * 1024)).toFixed(2), storageUnit: 'GB' };
};

const safeSegment = (value) => {
	const clean = (value || '').toString().trim().replace(/[^a-zA-Z0-9._-]/g, '_');
	return clean || 'file';
};

const buildObjectKey = (reqUser, originalName) => {
	const userSegment = safeSegment(reqUser.username || reqUser.email || reqUser.id);
	const fileSegment = safeSegment(originalName);
	return `${userSegment}/${Date.now()}-${fileSegment}`;
};

const aggregateUsage = async (match) => {
	const agg = await File.aggregate([
		{ $match: match },
		{ $group: { _id: null, total: { $sum: '$fileSize' } } }
	]);
	return agg[0]?.total || 0;
};

const canAccessFile = (file, userId) => {
	const isOwner = String(file.userId) === String(userId);
	const isShared = file.sharedWith?.some((id) => String(id) === String(userId));
	return isOwner || isShared;
};

const storageReady = () => Boolean(BUCKET && process.env.R2_ENDPOINT && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY);

module.exports = {
	MAX_FILE_SIZE,
	USER_QUOTA,
	GLOBAL_QUOTA,
	BUCKET,
	LOCAL_FALLBACK_ENABLED,
	isNetworkTimeoutError,
	cleanupTempUploads,
	formatStorage,
	buildObjectKey,
	aggregateUsage,
	canAccessFile,
	storageReady,
};
